/**
 * Compare scrapers by running them separately and saving outputs.
 *
 * Usage:
 *   npm run compare:scrapers
 */

import { config, validateConfig } from '../src/config/index.js'
import { ensureConfigInteractive } from '../src/config/interactive-setup.js'
import { logger } from '../src/utils/logger.js'
import { RedditScraper } from '../src/scrapers/reddit.js'
import { LLMRedditScraper } from '../src/scrapers/llm-reddit.js'
import type { ScrapedPost, Scraper } from '../src/scrapers/types.js'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

interface ScraperResult {
  scraperName: string
  posts: ScrapedPost[]
  timestamp: string
  durationMs: number
  error?: string
}

interface ComparisonResult {
  oldScraper: ScraperResult
  newScraper: ScraperResult
  comparison: {
    oldOnly: ScrapedPost[]
    newOnly: ScrapedPost[]
    common: ScrapedPost[]
    oldCount: number
    newCount: number
    commonCount: number
  }
}

function serializePost(post: ScrapedPost): Record<string, unknown> {
  return {
    ...post,
    createdAt: post.createdAt.toISOString(),
  }
}

async function runScraper(scraper: Scraper, since: Date): Promise<ScraperResult> {
  const startTime = Date.now()
  logger.info({ scraper: scraper.name }, 'Running scraper')

  try {
    const posts = await scraper.scrape(since)
    const durationMs = Date.now() - startTime

    logger.info({
      scraper: scraper.name,
      count: posts.length,
      durationMs,
    }, 'Scraper completed')

    return {
      scraperName: scraper.name,
      posts,
      timestamp: new Date().toISOString(),
      durationMs,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    logger.error({
      scraper: scraper.name,
      error: errorMessage,
      durationMs,
    }, 'Scraper failed')

    return {
      scraperName: scraper.name,
      posts: [],
      timestamp: new Date().toISOString(),
      durationMs,
      error: errorMessage,
    }
  }
}

function compareResults(oldResult: ScraperResult, newResult: ScraperResult): ComparisonResult['comparison'] {
  // Create sets of sourceId+sourceUrl for comparison
  const oldIds = new Set(
    oldResult.posts.map(p => `${p.source}:${p.sourceId}`)
  )
  const newIds = new Set(
    newResult.posts.map(p => `${p.source}:${p.sourceId}`)
  )

  const oldOnly = oldResult.posts.filter(p => !newIds.has(`${p.source}:${p.sourceId}`))
  const newOnly = newResult.posts.filter(p => !oldIds.has(`${p.source}:${p.sourceId}`))
  const common = oldResult.posts.filter(p => newIds.has(`${p.source}:${p.sourceId}`))

  return {
    oldOnly,
    newOnly,
    common,
    oldCount: oldResult.posts.length,
    newCount: newResult.posts.length,
    commonCount: common.length,
  }
}

async function saveResults(results: ComparisonResult): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const outputDir = join(process.cwd(), 'comparison-output')

  try {
    await mkdir(outputDir, { recursive: true })
  } catch (error) {
    // Directory might already exist, that's fine
  }

  // Save individual scraper results
  const oldFile = join(outputDir, `old-scraper-${timestamp}.json`)
  const newFile = join(outputDir, `new-scraper-${timestamp}.json`)
  const comparisonFile = join(outputDir, `comparison-${timestamp}.json`)

  await writeFile(
    oldFile,
    JSON.stringify({
      scraperName: results.oldScraper.scraperName,
      timestamp: results.oldScraper.timestamp,
      durationMs: results.oldScraper.durationMs,
      error: results.oldScraper.error,
      count: results.oldScraper.posts.length,
      posts: results.oldScraper.posts.map(serializePost),
    }, null, 2)
  )

  await writeFile(
    newFile,
    JSON.stringify({
      scraperName: results.newScraper.scraperName,
      timestamp: results.newScraper.timestamp,
      durationMs: results.newScraper.durationMs,
      error: results.newScraper.error,
      count: results.newScraper.posts.length,
      posts: results.newScraper.posts.map(serializePost),
    }, null, 2)
  )

  // Save comparison summary
  await writeFile(
    comparisonFile,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      summary: {
        oldScraper: results.oldScraper.scraperName,
        newScraper: results.newScraper.scraperName,
        oldCount: results.comparison.oldCount,
        newCount: results.comparison.newCount,
        commonCount: results.comparison.commonCount,
        oldOnlyCount: results.comparison.oldOnly.length,
        newOnlyCount: results.comparison.newOnly.length,
      },
      oldOnly: results.comparison.oldOnly.map(serializePost),
      newOnly: results.comparison.newOnly.map(serializePost),
      common: results.comparison.common.map(serializePost),
    }, null, 2)
  )

  logger.info({
    oldFile,
    newFile,
    comparisonFile,
  }, 'Results saved')

  // Print summary to console
  console.log('\n=== Scraper Comparison Summary ===\n')
  console.log(`Old Scraper (${results.oldScraper.scraperName}):`)
  console.log(`  Posts found: ${results.comparison.oldCount}`)
  console.log(`  Duration: ${results.oldScraper.durationMs}ms`)
  if (results.oldScraper.error) {
    console.log(`  Error: ${results.oldScraper.error}`)
  }

  console.log(`\nNew Scraper (${results.newScraper.scraperName}):`)
  console.log(`  Posts found: ${results.comparison.newCount}`)
  console.log(`  Duration: ${results.newScraper.durationMs}ms`)
  if (results.newScraper.error) {
    console.log(`  Error: ${results.newScraper.error}`)
  }

  console.log(`\nComparison:`)
  console.log(`  Common posts: ${results.comparison.commonCount}`)
  console.log(`  Only in old scraper: ${results.comparison.oldOnly.length}`)
  console.log(`  Only in new scraper: ${results.comparison.newOnly.length}`)

  console.log(`\nFiles saved to: ${outputDir}`)
  console.log(`  - ${oldFile.split('/').pop()}`)
  console.log(`  - ${newFile.split('/').pop()}`)
  console.log(`  - ${comparisonFile.split('/').pop()}\n`)
}

async function main(): Promise<void> {
  await ensureConfigInteractive()

  try {
    validateConfig()
  } catch (error) {
    logger.error({ error }, 'Configuration validation failed')
    process.exit(1)
  }

  const since = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000)
  logger.info({ since: since.toISOString() }, 'Starting scraper comparison')

  // Run old scraper
  const oldScraper = new RedditScraper()
  const oldResult = await runScraper(oldScraper, since)

  // Run new scraper
  const newScraper = new LLMRedditScraper()
  const newResult = await runScraper(newScraper, since)

  // Compare results
  const comparison = compareResults(oldResult, newResult)

  const results: ComparisonResult = {
    oldScraper: oldResult,
    newScraper: newResult,
    comparison,
  }

  // Save results
  await saveResults(results)

  logger.info('Comparison completed')
}

main().catch(error => {
  logger.error({ error }, 'Fatal error')
  process.exit(1)
})

