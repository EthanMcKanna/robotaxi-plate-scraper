import { downloadImage } from '../scrapers/http.js'
import { logger } from '../utils/logger.js'
import { robotaxiWorkerBaseUrl, signedWorkerRequest } from '../cloudflare/ingestion.js'

// Generate a unique filename for the uploaded image
function generateFilename(plateNumber: string, originalUrl: string): string {
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(2, 8)

  // Determine extension from URL
  let extension = 'jpg'
  if (originalUrl.includes('.png')) {
    extension = 'png'
  } else if (originalUrl.includes('.webp')) {
    extension = 'webp'
  }

  return `scraped/${plateNumber}-${timestamp}-${randomId}.${extension}`
}

// Get the MIME type from extension
function getMimeType(filename: string): string {
  if (filename.endsWith('.png')) {
    return 'image/png'
  } else if (filename.endsWith('.webp')) {
    return 'image/webp'
  }
  return 'image/jpeg'
}

export interface UploadResult {
  success: boolean
  publicUrl?: string
  error?: string
}

export async function uploadScrapedImage(
  imageUrl: string,
  plateNumber: string
): Promise<UploadResult> {
  try {
    // Download the image
    const imageBuffer = await downloadImage(imageUrl)

    // Generate filename
    const filename = generateFilename(plateNumber, imageUrl)
    const mimeType = getMimeType(filename)

    const idempotencyKey = `robotaxi-plate-scraper:media:${plateNumber}:${filename}`.slice(0, 200)
    const response = await signedWorkerRequest('/v1/media', {
      method: 'PUT', body: imageBuffer, idempotencyKey, contentType: mimeType,
    })
    if (!response) return { success: false, error: 'Robotaxi Worker is not configured' }
    if (!response.ok) return { success: false, error: `Robotaxi Worker rejected upload (${response.status})` }
    const result = await response.json() as { url?: unknown }
    if (typeof result.url !== 'string') return { success: false, error: 'Robotaxi Worker returned an invalid upload receipt' }
    const publicUrl = new URL(result.url, robotaxiWorkerBaseUrl()).toString()
    logger.info({ imageUrl, filename }, 'Uploaded image to private R2')
    return { success: true, publicUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error, imageUrl }, 'Upload failed')
    return { success: false, error: message }
  }
}
