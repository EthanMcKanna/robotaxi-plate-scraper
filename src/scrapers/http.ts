import { logger } from '../utils/logger.js'
import { delay, randomDelay } from '../utils/delay.js'

// User agents to rotate for web scraping
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
]

let userAgentIndex = 0

export function getRandomUserAgent(): string {
  userAgentIndex = (userAgentIndex + 1) % USER_AGENTS.length
  return USER_AGENTS[userAgentIndex]
}

export interface FetchOptions {
  headers?: Record<string, string>
  retries?: number
  retryDelay?: number
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const { retries = 3, retryDelay = 2000 } = options

  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'no-cache',
    ...options.headers,
  }

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers })

      if (response.status === 429) {
        // Rate limited - wait longer
        logger.warn({ url, attempt }, 'Rate limited, waiting...')
        await delay(retryDelay * attempt * 2)
        continue
      }

      if (!response.ok && response.status >= 500) {
        // Server error - retry
        logger.warn({ url, status: response.status, attempt }, 'Server error, retrying...')
        await delay(retryDelay * attempt)
        continue
      }

      return response
    } catch (error) {
      lastError = error as Error
      logger.warn({ url, error: lastError.message, attempt }, 'Fetch failed, retrying...')
      await delay(retryDelay * attempt)
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`)
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetchWithRetry(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json() as Promise<T>
}

export async function fetchHtml(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await fetchWithRetry(url, options)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.text()
}

export async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetchWithRetry(url, {
    headers: {
      'Accept': 'image/*',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
