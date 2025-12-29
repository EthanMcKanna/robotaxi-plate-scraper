import { getSupabaseClient } from './client.js'
import { logger } from '../utils/logger.js'
import type { PostSource } from '../scrapers/types.js'

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
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('scraper_processed_posts')
    .select('id')
    .eq('source', source)
    .eq('source_id', sourceId)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is "no rows returned" which is expected
    logger.error({ error, source, sourceId }, 'Error checking processed posts')
  }

  return !!data
}

export async function markPostProcessed(post: ProcessedPost): Promise<void> {
  const supabase = getSupabaseClient()

  const { error } = await supabase
    .from('scraper_processed_posts')
    .upsert({
      source: post.source,
      source_id: post.sourceId,
      source_url: post.sourceUrl,
      result: post.result,
      submission_id: post.submissionId,
      error_message: post.errorMessage,
      processed_at: new Date().toISOString(),
    }, {
      onConflict: 'source,source_id',
    })

  if (error) {
    logger.error({ error, post }, 'Failed to mark post as processed')
  }
}
