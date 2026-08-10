import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import type { VehicleProvider } from '../utils/validation.js'
import type { PostSource } from '../scrapers/types.js'
import { robotaxiWorkerBaseUrl, sendSourceRecord } from '../cloudflare/ingestion.js'

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
  const url = new URL(`${robotaxiWorkerBaseUrl()}/v1/api/vehicles/lookup`)
  url.searchParams.set('plate', plateNumber)
  url.searchParams.set('provider', provider)
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Fleet lookup failed (${response.status})`)
  const result = await response.json() as { data?: unknown }
  return Boolean(result.data)
}

// Check if there's already a pending submission for this plate
export async function pendingSubmissionExists(
  plateNumber: string,
  provider: VehicleProvider
): Promise<boolean> {
  const url = new URL(`${robotaxiWorkerBaseUrl()}/v1/api/submissions/check`)
  url.searchParams.set('plate', plateNumber)
  url.searchParams.set('provider', provider)
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw new Error(`Submission lookup failed (${response.status})`)
  const result = await response.json() as { status?: unknown }
  return result.status === 'pending'
}

// Create a new vehicle submission
export async function createSubmission(data: SubmissionData): Promise<SubmissionResult> {
  // Determine default colors based on provider
  const color = data.provider === 'waymo' ? 'White' : 'Unknown'
  const interiorColor = data.provider === 'waymo' ? 'Black' : 'Unknown'

  const submitterNotes = `Auto-scraped from ${data.source}: ${data.sourceUrl}`

  const submissionId = crypto.randomUUID()

  logger.info({
    submissionId,
    plate: data.plateNumber,
    provider: data.provider,
  }, 'Created submission')

  try {
    const sent = await sendSourceRecord({
      dataset: 'vehicleSubmissions',
      id: submissionId,
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
    if (!sent) throw new Error('Robotaxi Worker ingestion is not configured')
    logger.info({ submissionId }, 'Queued submission in Robotaxi Worker')
  } catch (cloudflareError) {
    logger.error(
      { errorType: cloudflareError instanceof Error ? cloudflareError.name : 'unknown' },
      'Failed to create submission in Robotaxi Worker'
    )
    return { success: false, error: 'Cloudflare ingestion failed' }
  }

  return { success: true, submissionId }
}
