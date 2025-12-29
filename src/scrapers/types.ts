export type PostSource = 'reddit'

export interface ScrapedPost {
  source: PostSource
  sourceId: string           // Platform-specific ID
  sourceUrl: string          // Full URL to original post
  authorUsername: string
  title: string              // Post/video title
  text: string               // Post body, tweet text, or video description
  imageUrls: string[]        // Direct image URLs (includes video thumbnails)
  createdAt: Date
  subreddit?: string         // Reddit only
}

export interface ProcessedResult {
  post: ScrapedPost
  isRobotaxi: boolean
  provider: 'tesla' | 'waymo' | null
  plateNumber: string | null
  confidence: number
  imageUrl: string           // The image used for detection
}

export interface Scraper {
  name: string
  scrape(since: Date): Promise<ScrapedPost[]>
}
