import { config, validateConfig } from './config/index.js'
import { ensureConfigInteractive } from './config/interactive-setup.js'
import { logger } from './utils/logger.js'
import { scraperRegistry } from './scrapers/registry.js'
import { RedditScraper } from './scrapers/reddit.js'
import type { ScrapedPost } from './scrapers/types.js'
import { detectRobotaxi } from './vision/detector.js'
import { extractPlate } from './vision/plate-extractor.js'
import { isPostProcessed, markPostProcessed } from './database/tracking.js'
import { plateExistsInFleet, pendingSubmissionExists, createSubmission } from './database/submissions.js'
import { uploadScrapedImage } from './storage/uploader.js'
import { delay } from './utils/delay.js'

const MIN_DETECTION_CONFIDENCE = 70
const MIN_PLATE_CONFIDENCE = 60

function registerScrapers(): void {
  logger.info('Registering scrapers...')

  scraperRegistry.register(new RedditScraper(), {
    enabled: config.enableReddit,
    priority: 10,
  })

  const allHealth = scraperRegistry.getAllHealth()
  const enabledCount = allHealth.filter(h => h.enabled).length

  logger.info({
    total: allHealth.length,
    enabled: enabledCount,
    scrapers: allHealth.filter(h => h.enabled).map(h => h.name),
  }, 'Scrapers registered')
}

async function processPost(post: ScrapedPost): Promise<void> {
  logger.info({
    source: post.source,
    sourceId: post.sourceId,
    title: post.title.slice(0, 50),
    imageCount: post.imageUrls.length,
  }, 'Processing post')

  for (const imageUrl of post.imageUrls) {
    try {
      const detection = await detectRobotaxi(imageUrl)

      if (!detection.isRobotaxi || !detection.provider) {
        logger.debug({ imageUrl, detection }, 'Not a robotaxi')
        continue
      }

      if (detection.confidence < MIN_DETECTION_CONFIDENCE) {
        logger.debug({ imageUrl, confidence: detection.confidence }, 'Detection confidence too low')
        continue
      }

      logger.info({
        imageUrl,
        provider: detection.provider,
        confidence: detection.confidence,
      }, 'Robotaxi detected')

      const plateResult = await extractPlate(imageUrl, detection.provider)

      if (!plateResult.found || !plateResult.plateNumber) {
        logger.info({ imageUrl }, 'No plate found')
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'no_plate',
        })
        return
      }

      if (plateResult.confidence < MIN_PLATE_CONFIDENCE) {
        logger.info({
          plate: plateResult.plateNumber,
          confidence: plateResult.confidence,
        }, 'Plate confidence too low')
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'no_plate',
        })
        return
      }

      const plateNumber = plateResult.plateNumber

      if (await plateExistsInFleet(plateNumber, detection.provider)) {
        logger.info({ plate: plateNumber }, 'Plate already in fleet')
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'duplicate',
        })
        return
      }

      if (await pendingSubmissionExists(plateNumber, detection.provider)) {
        logger.info({ plate: plateNumber }, 'Pending submission already exists')
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'duplicate',
        })
        return
      }

      const uploadResult = await uploadScrapedImage(imageUrl, plateNumber)

      if (!uploadResult.success || !uploadResult.publicUrl) {
        logger.error({ imageUrl, error: uploadResult.error }, 'Failed to upload image')
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'error',
          errorMessage: `Upload failed: ${uploadResult.error}`,
        })
        return
      }

      const submissionResult = await createSubmission({
        plateNumber,
        provider: detection.provider,
        imageUrls: [uploadResult.publicUrl],
        sourceUrl: post.sourceUrl,
        source: post.source,
      })

      if (!submissionResult.success) {
        logger.error({ error: submissionResult.error }, 'Failed to create submission')
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'error',
          errorMessage: submissionResult.error,
        })
        return
      }

      logger.info({
        plate: plateNumber,
        provider: detection.provider,
        submissionId: submissionResult.submissionId,
      }, 'Created submission successfully')

      await markPostProcessed({
        source: post.source,
        sourceId: post.sourceId,
        sourceUrl: post.sourceUrl,
        result: 'submitted',
        submissionId: submissionResult.submissionId,
      })

      return
    } catch (error) {
      logger.error({ error, imageUrl }, 'Error processing image')
    }

    await delay(1000)
  }

  await markPostProcessed({
    source: post.source,
    sourceId: post.sourceId,
    sourceUrl: post.sourceUrl,
    result: 'not_robotaxi',
  })
}

async function runScrapeJob(): Promise<void> {
  const startTime = Date.now()
  const since = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000)

  logger.info({ since: since.toISOString() }, 'Starting scrape job')

  const allPosts = await scraperRegistry.runAll(since, config.maxConcurrentScrapers)

  logger.info({ totalPosts: allPosts.length }, 'Total posts collected')

  let processed = 0
  let skipped = 0

  for (const post of allPosts) {
    if (await isPostProcessed(post.source, post.sourceId)) {
      skipped++
      continue
    }

    try {
      await processPost(post)
      processed++
    } catch (error) {
      logger.error({ error, post: post.sourceId }, 'Failed to process post')
      await markPostProcessed({
        source: post.source,
        sourceId: post.sourceId,
        sourceUrl: post.sourceUrl,
        result: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      })
    }

    await delay(2000)
  }

  const duration = Math.round((Date.now() - startTime) / 1000)
  logger.info({
    duration: `${duration}s`,
    totalPosts: allPosts.length,
    processed,
    skipped,
  }, 'Scrape job completed')
}

async function main(): Promise<void> {
  await ensureConfigInteractive()

  try {
    validateConfig()
  } catch (error) {
    logger.error({ error }, 'Configuration validation failed')
    process.exit(1)
  }

  registerScrapers()

  logger.info({
    lookback: `${config.lookbackHours} hours`,
    concurrency: config.maxConcurrentScrapers,
  }, 'Robotaxi scraper starting')

  await runScrapeJob()
}

main().catch(error => {
  logger.error({ error }, 'Fatal error')
  process.exit(1)
})
