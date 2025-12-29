import { getSupabaseClient } from '../database/client.js'
import { downloadImage } from '../scrapers/http.js'
import { logger } from '../utils/logger.js'

const STORAGE_BUCKET = 'vehicle-submissions'

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

    // Upload to Supabase Storage
    const supabase = getSupabaseClient()
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filename, imageBuffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (error) {
      logger.error({ error, imageUrl, filename }, 'Failed to upload image')
      return { success: false, error: error.message }
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(data.path)

    logger.info({ imageUrl, filename, publicUrl: urlData.publicUrl }, 'Uploaded image')

    return { success: true, publicUrl: urlData.publicUrl }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error({ error, imageUrl }, 'Upload failed')
    return { success: false, error: message }
  }
}
