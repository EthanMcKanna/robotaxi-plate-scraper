import { analyzeImageWithPrompt, parseJsonResponse } from './gemini.js'
import { logger } from '../utils/logger.js'

export interface DetectionResult {
  isRobotaxi: boolean
  provider: 'tesla' | 'waymo' | null
  confidence: number
  reasoning: string
}

const DETECTION_PROMPT = `
Analyze this image and determine if it shows an autonomous robotaxi vehicle.

TESLA ROBOTAXI INDICATORS:
- Tesla Model Y with external sensors/cameras
- Roof-mounted sensor pods or camera arrays
- Red and black color scheme with "ROBOTAXI" branding (some vehicles)
- Test vehicle markings or FSD stickers
- California or Texas license plates common

WAYMO ONE INDICATORS:
- White Jaguar I-PACE
- Distinctive spinning LIDAR dome on roof
- Multiple camera pods around the vehicle body
- Waymo logo or "Waymo" text visible
- Arizona or California license plates common

IMPORTANT:
- Only return true for actual robotaxi/autonomous vehicles, not regular cars
- Regular Teslas without visible sensor hardware are NOT robotaxis
- Regular Jaguar I-PACEs without Waymo equipment are NOT robotaxis

Respond with ONLY valid JSON (no other text):
{
  "isRobotaxi": true or false,
  "provider": "tesla" or "waymo" or null,
  "confidence": 0-100,
  "reasoning": "brief 1-2 sentence explanation"
}
`

export async function detectRobotaxi(imageUrl: string): Promise<DetectionResult> {
  const defaultResult: DetectionResult = {
    isRobotaxi: false,
    provider: null,
    confidence: 0,
    reasoning: 'Analysis failed',
  }

  try {
    const response = await analyzeImageWithPrompt(imageUrl, DETECTION_PROMPT)

    if (!response.success) {
      return defaultResult
    }

    const parsed = parseJsonResponse<DetectionResult>(response.text)

    if (!parsed) {
      logger.warn({ response: response.text }, 'Failed to parse detection response')
      return defaultResult
    }

    // Validate the response
    if (typeof parsed.isRobotaxi !== 'boolean') {
      return defaultResult
    }

    // Normalize provider value
    if (parsed.provider && !['tesla', 'waymo'].includes(parsed.provider)) {
      parsed.provider = null
    }

    // Ensure confidence is a number
    parsed.confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0

    logger.info({
      imageUrl,
      isRobotaxi: parsed.isRobotaxi,
      provider: parsed.provider,
      confidence: parsed.confidence,
    }, 'Detection result')

    return parsed
  } catch (error) {
    logger.error({ error, imageUrl }, 'Detection failed')
    return defaultResult
  }
}
