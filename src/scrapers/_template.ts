import type { ScrapedPost, Scraper } from './types.js'

// Copy this file to create a new provider scraper.
export class ProviderScraper implements Scraper {
  name = 'provider'

  async scrape(since: Date): Promise<ScrapedPost[]> {
    // 1) Fetch posts newer than `since`
    // 2) Extract direct image URLs
    // 3) Return ScrapedPost[]
    return []
  }
}
