import { logger } from '../utils/logger.js'
import type { PostSource } from '../scrapers/types.js'
import { sendSourceRecord, sourceRecordExists } from '../cloudflare/ingestion.js'

export type ProcessResult = 'submitted' | 'not_robotaxi' | 'no_plate' | 'duplicate' | 'error'

export interface ProcessedPost {
  source: PostSource
  sourceId: string
  sourceUrl?: string
  result: ProcessResult
  submissionId?: string
  errorMessage?: string
}

export async function isPostProcessed(
  source: PostSource,
  sourceId: string
): Promise<boolean> {
  return sourceRecordExists('scraperProcessedPosts', `${source}:${sourceId}`)
}

export async function markPostProcessed(post: ProcessedPost): Promise<void> {
  const id = `${post.source}:${post.sourceId}`
  try {
    const sent = await sendSourceRecord({
      dataset: 'scraperProcessedPosts',
      id,
      record: {
        source: post.source,
        sourceId: post.sourceId,
        sourceUrl: post.sourceUrl,
        result: post.result,
        submissionId: post.submissionId,
        errorMessage: post.errorMessage,
        processedAt: new Date().toISOString(),
      },
    })
    if (!sent) throw new Error('Robotaxi Worker ingestion is not configured')
  } catch (error) {
    logger.error({ errorType: error instanceof Error ? error.name : 'unknown', source: post.source, sourceId: post.sourceId }, 'Failed to mark post as processed')
    throw error
  }
}
