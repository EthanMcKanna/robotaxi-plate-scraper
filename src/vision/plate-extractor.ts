import { analyzeImageWithPrompt, parseJsonResponse } from './gemini.js'
import { logger } from '../utils/logger.js'
import { validateAndCleanPlate, type VehicleProvider } from '../utils/validation.js'

export interface PlateResult {
  found: boolean
  plateNumber: string | null
  confidence: number
  reasoning: string
}

function getPlatePrompt(provider: VehicleProvider): string {
  const format = provider === 'tesla'
    ? 'exactly 7 alphanumeric characters (e.g., ABC1234, RBT0001)'
    : '5-8 alphanumeric characters (e.g., 8XKD123, WAYMO1)'

  return `
Extract the license plate number from this image of a ${provider === 'tesla' ? 'Tesla' : 'Waymo'} robotaxi vehicle.

Expected plate format: ${format}

INSTRUCTIONS:
1. Look for the rear license plate (most common) or front plate
2. Only extract US license plate format
3. Convert all letters to UPPERCASE
4. Only include letters A-Z and numbers 0-9
5. Do NOT guess - only return a plate if you can clearly read it

Respond with ONLY valid JSON (no other text):
{
  "found": true or false,
  "plateNumber": "ABC1234" or null,
  "confidence": 0-100,
  "reasoning": "brief explanation of how you identified the plate or why you couldn't"
}
`
}

export async function extractPlate(
  imageUrl: string,
  provider: VehicleProvider
): Promise<PlateResult> {
  const defaultResult: PlateResult = {
    found: false,
    plateNumber: null,
    confidence: 0,
    reasoning: 'Extraction failed',
  }

  try {
    const prompt = getPlatePrompt(provider)
    const response = await analyzeImageWithPrompt(imageUrl, prompt)

    if (!response.success) {
      return defaultResult
    }

    const parsed = parseJsonResponse<PlateResult>(response.text)

    if (!parsed) {
      logger.warn({ response: response.text }, 'Failed to parse plate response')
      return defaultResult
    }

    // Validate the response
    if (typeof parsed.found !== 'boolean') {
      return defaultResult
    }

    // If plate was found, validate and clean it
    if (parsed.found && parsed.plateNumber) {
      const cleanedPlate = validateAndCleanPlate(provider, parsed.plateNumber)

      if (cleanedPlate) {
        parsed.plateNumber = cleanedPlate
      } else {
        // Plate didn't pass validation
        logger.warn({
          rawPlate: parsed.plateNumber,
          provider,
        }, 'Plate failed validation')
        parsed.found = false
        parsed.plateNumber = null
        parsed.reasoning = `Extracted plate "${parsed.plateNumber}" did not match expected format`
      }
    }

    logger.info({
      imageUrl,
      found: parsed.found,
      plate: parsed.plateNumber,
      confidence: parsed.confidence,
    }, 'Plate extraction result')

    return parsed
  } catch (error) {
    logger.error({ error, imageUrl }, 'Plate extraction failed')
    return defaultResult
  }
}
