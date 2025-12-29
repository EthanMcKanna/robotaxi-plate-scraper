import pLimit from 'p-limit'
import { logger } from '../utils/logger.js'
import { delay } from '../utils/delay.js'

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
  timeoutMs?: number
  maxConcurrentPerHost?: number
}

const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_MAX_CONCURRENT_PER_HOST = 4
const hostLimits = new Map<string, ReturnType<typeof pLimit>>()

function getHostLimit(hostname: string, maxConcurrent: number): ReturnType<typeof pLimit> {
  const key = `${hostname}:${maxConcurrent}`
  const existing = hostLimits.get(key)
  if (existing) {
    return existing
  }
  const limiter = pLimit(maxConcurrent)
  hostLimits.set(key, limiter)
  return limiter
}

function parseRetryAfter(retryAfter: string | null): number | null {
  if (!retryAfter) return null
  const seconds = Number(retryAfter)
  if (!Number.isNaN(seconds) && seconds >= 0) {
    return seconds * 1000
  }
  const parsedDate = Date.parse(retryAfter)
  if (!Number.isNaN(parsedDate)) {
    return Math.max(0, parsedDate - Date.now())
  }
  return null
}

export async function fetchWithRetry(
  url: string,
  options: FetchOptions = {}
): Promise<Response> {
  const {
    retries = 3,
    retryDelay = 2000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxConcurrentPerHost = DEFAULT_MAX_CONCURRENT_PER_HOST,
  } = options

  const headers: Record<string, string> = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Cache-Control': 'no-cache',
    ...options.headers,
  }

  const hostname = new URL(url).hostname
  const limiter = getHostLimit(hostname, maxConcurrentPerHost)

  return limiter(async () => {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(url, { headers, signal: controller.signal })
        clearTimeout(timeoutId)

        if (response.status === 429) {
          // Rate limited - respect Retry-After if provided
          const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'))
          const backoffMs = retryDelay * attempt * 2
          const waitMs = retryAfterMs ? Math.max(retryAfterMs, backoffMs) : backoffMs
          logger.warn({ url, attempt, waitMs }, 'Rate limited, waiting...')
          await delay(waitMs)
          continue
        }

        if (!response.ok && response.status >= 500) {
          // Server error - retry
          const retryAfterMs = parseRetryAfter(response.headers.get('Retry-After'))
          const backoffMs = retryDelay * attempt
          const waitMs = retryAfterMs ? Math.max(retryAfterMs, backoffMs) : backoffMs
          logger.warn({ url, status: response.status, attempt, waitMs }, 'Server error, retrying...')
          await delay(waitMs)
          continue
        }

        return response
      } catch (error) {
        clearTimeout(timeoutId)
        lastError = error as Error
        const waitMs = retryDelay * attempt
        logger.warn({ url, error: lastError.message, attempt, waitMs }, 'Fetch failed, retrying...')
        await delay(waitMs)
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${retries} attempts`)
  })
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
