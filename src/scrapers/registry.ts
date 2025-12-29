import pLimit from 'p-limit'
import { logger } from '../utils/logger.js'
import type { Scraper, ScrapedPost } from './types.js'

export type ScraperHealthStatus = 'healthy' | 'degraded' | 'failed'

export interface ScraperHealth {
  name: string
  enabled: boolean
  status: ScraperHealthStatus
  lastSuccess: Date | null
  lastError: string | null
  consecutiveFailures: number
  totalSuccesses: number
  totalFailures: number
}

export interface RegisteredScraper {
  scraper: Scraper
  enabled: boolean
  priority: number // Lower = higher priority
  health: ScraperHealth
}

// Thresholds for health status
const DEGRADED_FAILURE_THRESHOLD = 2
const FAILED_FAILURE_THRESHOLD = 5
const RECOVERY_CHECK_INTERVAL = 10 // Check failed scrapers every N runs

export class ScraperRegistry {
  private scrapers: Map<string, RegisteredScraper> = new Map()
  private runCount = 0

  register(scraper: Scraper, options: { enabled?: boolean; priority?: number } = {}): void {
    const { enabled = true, priority = 100 } = options

    this.scrapers.set(scraper.name, {
      scraper,
      enabled,
      priority,
      health: {
        name: scraper.name,
        enabled,
        status: 'healthy',
        lastSuccess: null,
        lastError: null,
        consecutiveFailures: 0,
        totalSuccesses: 0,
        totalFailures: 0,
      },
    })

    logger.info({ name: scraper.name, enabled, priority }, 'Registered scraper')
  }

  setEnabled(name: string, enabled: boolean): void {
    const registered = this.scrapers.get(name)
    if (registered) {
      registered.enabled = enabled
      registered.health.enabled = enabled
      logger.info({ name, enabled }, 'Updated scraper enabled status')
    }
  }

  getEnabled(): Scraper[] {
    return Array.from(this.scrapers.values())
      .filter(r => r.enabled && r.health.status !== 'failed')
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.scraper)
  }

  getAll(): Scraper[] {
    return Array.from(this.scrapers.values())
      .sort((a, b) => a.priority - b.priority)
      .map(r => r.scraper)
  }

  getHealth(name: string): ScraperHealth | undefined {
    return this.scrapers.get(name)?.health
  }

  getAllHealth(): ScraperHealth[] {
    return Array.from(this.scrapers.values()).map(r => r.health)
  }

  markSuccess(name: string): void {
    const registered = this.scrapers.get(name)
    if (registered) {
      registered.health.lastSuccess = new Date()
      registered.health.lastError = null
      registered.health.consecutiveFailures = 0
      registered.health.totalSuccesses++
      registered.health.status = 'healthy'

      logger.debug({ name }, 'Marked scraper as successful')
    }
  }

  markFailure(name: string, error: string): void {
    const registered = this.scrapers.get(name)
    if (registered) {
      registered.health.lastError = error
      registered.health.consecutiveFailures++
      registered.health.totalFailures++

      // Update status based on consecutive failures
      if (registered.health.consecutiveFailures >= FAILED_FAILURE_THRESHOLD) {
        registered.health.status = 'failed'
        logger.error({ name, consecutiveFailures: registered.health.consecutiveFailures }, 'Scraper marked as failed')
      } else if (registered.health.consecutiveFailures >= DEGRADED_FAILURE_THRESHOLD) {
        registered.health.status = 'degraded'
        logger.warn({ name, consecutiveFailures: registered.health.consecutiveFailures }, 'Scraper marked as degraded')
      }
    }
  }

  async runAll(since: Date, concurrency: number = 3): Promise<ScrapedPost[]> {
    this.runCount++
    const allPosts: ScrapedPost[] = []

    // Get enabled scrapers
    let scrapersToRun = this.getEnabled()

    // Periodically try to recover failed scrapers
    if (this.runCount % RECOVERY_CHECK_INTERVAL === 0) {
      const failedScrapers = Array.from(this.scrapers.values())
        .filter(r => r.enabled && r.health.status === 'failed')
        .map(r => r.scraper)

      if (failedScrapers.length > 0) {
        logger.info({ count: failedScrapers.length }, 'Attempting to recover failed scrapers')
        scrapersToRun = [...scrapersToRun, ...failedScrapers]
      }
    }

    if (scrapersToRun.length === 0) {
      logger.warn('No scrapers available to run')
      return allPosts
    }

    logger.info({ count: scrapersToRun.length, scrapers: scrapersToRun.map(s => s.name) }, 'Running scrapers')

    // Run scrapers with concurrency limit
    const limit = pLimit(concurrency)

    const results = await Promise.allSettled(
      scrapersToRun.map(scraper =>
        limit(async () => {
          const startTime = Date.now()
          try {
            const posts = await scraper.scrape(since)
            const duration = Date.now() - startTime

            this.markSuccess(scraper.name)
            logger.info({ name: scraper.name, count: posts.length, durationMs: duration }, 'Scraper completed')

            return posts
          } catch (error) {
            const duration = Date.now() - startTime
            const message = error instanceof Error ? error.message : String(error)

            this.markFailure(scraper.name, message)
            logger.error({ name: scraper.name, error: message, durationMs: duration }, 'Scraper failed')

            throw error
          }
        })
      )
    )

    // Collect successful results
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allPosts.push(...result.value)
      }
    }

    // Log summary
    const successful = results.filter(r => r.status === 'fulfilled').length
    const failed = results.filter(r => r.status === 'rejected').length

    logger.info({
      successful,
      failed,
      totalPosts: allPosts.length,
    }, 'Scraper run completed')

    return allPosts
  }

  printHealthReport(): void {
    const healthData = this.getAllHealth()

    console.log('\n=== Scraper Health Report ===\n')

    for (const health of healthData) {
      const statusEmoji =
        health.status === 'healthy' ? '✅' :
        health.status === 'degraded' ? '⚠️' : '❌'

      console.log(`${statusEmoji} ${health.name}`)
      console.log(`   Enabled: ${health.enabled}`)
      console.log(`   Status: ${health.status}`)
      console.log(`   Successes: ${health.totalSuccesses}`)
      console.log(`   Failures: ${health.totalFailures}`)
      console.log(`   Consecutive Failures: ${health.consecutiveFailures}`)

      if (health.lastSuccess) {
        console.log(`   Last Success: ${health.lastSuccess.toISOString()}`)
      }
      if (health.lastError) {
        console.log(`   Last Error: ${health.lastError}`)
      }
      console.log()
    }
  }
}

// Singleton registry instance
export const scraperRegistry = new ScraperRegistry()
