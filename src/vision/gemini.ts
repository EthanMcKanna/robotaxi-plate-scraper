import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import { downloadImage } from '../scrapers/http.js'

let genAI: GoogleGenerativeAI | null = null
let model: GenerativeModel | null = null

function getModel(): GenerativeModel {
  if (!model) {
    genAI = new GoogleGenerativeAI(config.geminiApiKey)
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  }
  return model
}

export interface GeminiResponse {
  text: string
  success: boolean
}

export async function analyzeImageWithPrompt(
  imageUrl: string,
  prompt: string
): Promise<GeminiResponse> {
  try {
    const model = getModel()

    // Download image and convert to base64
    const imageBuffer = await downloadImage(imageUrl)
    const base64Image = imageBuffer.toString('base64')

    // Determine MIME type from URL
    let mimeType = 'image/jpeg'
    if (imageUrl.includes('.png')) {
      mimeType = 'image/png'
    } else if (imageUrl.includes('.webp')) {
      mimeType = 'image/webp'
    }

    // Create content with image
    const result = await model.generateContent([
      {
        inlineData: {
          mimeType,
          data: base64Image,
        },
      },
      { text: prompt },
    ])

    const response = await result.response
    const text = response.text()

    return { text, success: true }
  } catch (error) {
    logger.error({ error, imageUrl }, 'Gemini analysis failed')
    return { text: '', success: false }
  }
}

export function parseJsonResponse<T>(text: string): T | null {
  try {
    // Try to extract JSON from the response (may be wrapped in markdown code blocks)
    let jsonStr = text

    // Remove markdown code blocks if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1]
    }

    // Also try to find JSON object directly
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      jsonStr = objectMatch[0]
    }

    return JSON.parse(jsonStr.trim()) as T
  } catch {
    return null
  }
}
