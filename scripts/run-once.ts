/**
 * Run a single scrape job for testing.
 *
 * Usage:
 *   npm run scrape:once
 */

import { config, validateConfig } from '../src/config/index.js'
import { ensureConfigInteractive } from '../src/config/interactive-setup.js'
import { logger } from '../src/utils/logger.js'
import { RedditScraper } from '../src/scrapers/reddit.js'
import type { ScrapedPost, Scraper } from '../src/scrapers/types.js'
import { detectRobotaxi } from '../src/vision/detector.js'
import { extractPlate } from '../src/vision/plate-extractor.js'
import { isPostProcessed, markPostProcessed } from '../src/database/tracking.js'
import { plateExistsInFleet, pendingSubmissionExists, createSubmission } from '../src/database/submissions.js'
import { uploadScrapedImage } from '../src/storage/uploader.js'
import { delay } from '../src/utils/delay.js'

const MIN_DETECTION_CONFIDENCE = 70
const MIN_PLATE_CONFIDENCE = 60

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
        continue
      }

      if (detection.confidence < MIN_DETECTION_CONFIDENCE) {
        continue
      }

      logger.info({
        imageUrl,
        provider: detection.provider,
        confidence: detection.confidence,
      }, 'Robotaxi detected')

      const plateResult = await extractPlate(imageUrl, detection.provider)

      if (!plateResult.found || !plateResult.plateNumber) {
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'no_plate',
        })
        return
      }

      if (plateResult.confidence < MIN_PLATE_CONFIDENCE) {
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
        await markPostProcessed({
          source: post.source,
          sourceId: post.sourceId,
          sourceUrl: post.sourceUrl,
          result: 'duplicate',
        })
        return
      }

      if (await pendingSubmissionExists(plateNumber, detection.provider)) {
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

async function main(): Promise<void> {
  await ensureConfigInteractive()

  try {
    validateConfig()
  } catch (error) {
    logger.error({ error }, 'Configuration validation failed')
    process.exit(1)
  }

  const since = new Date(Date.now() - config.lookbackHours * 60 * 60 * 1000)
  logger.info({ since: since.toISOString() }, 'Running single scrape')

  const scrapers: Scraper[] = [new RedditScraper()]
  const allPosts: ScrapedPost[] = []

  for (const scraper of scrapers) {
    try {
      const posts = await scraper.scrape(since)
      allPosts.push(...posts)
      logger.info({ scraper: scraper.name, count: posts.length }, 'Collected posts')
    } catch (error) {
      logger.error({ scraper: scraper.name, error }, 'Scraper failed')
    }
  }

  logger.info({ totalPosts: allPosts.length }, 'Total posts collected')

  for (const post of allPosts) {
    if (await isPostProcessed(post.source, post.sourceId)) {
      continue
    }

    try {
      await processPost(post)
    } catch (error) {
      logger.error({ error, post: post.sourceId }, 'Failed to process post')
    }

    await delay(2000)
  }

  logger.info('Single scrape completed')
}

main().catch(error => {
  logger.error({ error }, 'Fatal error')
  process.exit(1)
})
