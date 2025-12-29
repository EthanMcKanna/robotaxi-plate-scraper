// Utility for rate limiting and delays

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Random delay between min and max milliseconds
export function randomDelay(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
  return delay(ms)
}

// Rate limiter class for API calls
export class RateLimiter {
  private lastCall: number = 0
  private minInterval: number

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond
  }

  async wait(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastCall
    if (elapsed < this.minInterval) {
      await delay(this.minInterval - elapsed)
    }
    this.lastCall = Date.now()
  }
}
