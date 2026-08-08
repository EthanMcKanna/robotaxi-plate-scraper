import { getSupabaseClient } from './client.js'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import type { VehicleProvider } from '../utils/validation.js'
import type { PostSource } from '../scrapers/types.js'
import { sendSourceRecord } from '../cloudflare/ingestion.js'

export interface SubmissionData {
  plateNumber: string
  provider: VehicleProvider
  imageUrls: string[]
  sourceUrl: string
  source: PostSource
}

export interface SubmissionResult {
  success: boolean
  submissionId?: string
  error?: string
}

// Check if plate already exists in vehicles table
export async function plateExistsInFleet(
  plateNumber: string,
  provider: VehicleProvider
): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('vehicles')
    .select('id')
    .eq('plate_number', plateNumber)
    .eq('provider', provider)
    .single()

  if (error && error.code !== 'PGRST116') {
    logger.error({ error, plateNumber, provider }, 'Error checking fleet')
  }

  return !!data
}

// Check if there's already a pending submission for this plate
export async function pendingSubmissionExists(
  plateNumber: string,
  provider: VehicleProvider
): Promise<boolean> {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase
    .from('vehicle_submissions')
    .select('id')
    .eq('plate_number', plateNumber)
    .eq('provider', provider)
    .eq('status', 'pending')
    .single()

  if (error && error.code !== 'PGRST116') {
    logger.error({ error, plateNumber, provider }, 'Error checking pending submissions')
  }

  return !!data
}

// Create a new vehicle submission
export async function createSubmission(data: SubmissionData): Promise<SubmissionResult> {
  const supabase = getSupabaseClient()

  // Determine default colors based on provider
  const color = data.provider === 'waymo' ? 'White' : 'Unknown'
  const interiorColor = data.provider === 'waymo' ? 'Black' : 'Unknown'

  const submitterNotes = `Auto-scraped from ${data.source}: ${data.sourceUrl}`

  const { data: submission, error } = await supabase
    .from('vehicle_submissions')
    .insert({
      plate_number: data.plateNumber,
      color,
      interior_color: interiorColor,
      service_area_id: null, // Admin will assign during review
      submitter_notes: submitterNotes,
      image_urls: data.imageUrls,
      status: 'pending',
      submitter_user_id: config.botUserId,
      provider: data.provider,
    })
    .select('id')
    .single()

  if (error) {
    logger.error({ error, data }, 'Failed to create submission')
    return { success: false, error: error.message }
  }

  logger.info({
    submissionId: submission.id,
    plate: data.plateNumber,
    provider: data.provider,
  }, 'Created submission')

  try {
    const sent = await sendSourceRecord({
      dataset: 'vehicleSubmissions',
      id: submission.id,
      record: {
        plateNumber: data.plateNumber,
        provider: data.provider,
        color,
        interiorColor,
        serviceAreaId: null,
        submitterNotes,
        imageUrls: data.imageUrls,
        status: 'pending',
        submitterUserId: config.botUserId,
        source: data.source,
        sourceUrl: data.sourceUrl,
      },
    })
    if (sent) logger.info({ submissionId: submission.id }, 'Queued submission in Robotaxi Worker')
  } catch (cloudflareError) {
    logger.error(
      { errorType: cloudflareError instanceof Error ? cloudflareError.name : 'unknown' },
      'Failed to queue submission in Robotaxi Worker'
    )
  }

  return { success: true, submissionId: submission.id }
}
