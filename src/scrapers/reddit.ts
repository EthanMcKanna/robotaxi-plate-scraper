import { fetchJson } from './http.js'
import { logger } from '../utils/logger.js'
import { delay } from '../utils/delay.js'
import { TARGET_SUBREDDITS, ROBOTAXI_KEYWORDS, ROBOTAXI_SUBREDDITS } from '../config/search-terms.js'
import type { ScrapedPost, Scraper } from './types.js'

const REDDIT_BASE_URLS = [
  'https://www.reddit.com',
  'https://old.reddit.com',
]

// Reddit JSON API response types
interface RedditListingData {
  after: string | null
  children: RedditPostWrapper[]
}

interface RedditListingResponse {
  kind: string
  data: RedditListingData
}

interface RedditPostWrapper {
  kind: string
  data: RedditPost
}

interface RedditPost {
  id: string
  name: string
  title: string
  selftext: string
  author: string
  subreddit: string
  permalink: string
  url: string
  created_utc: number
  is_video: boolean
  is_gallery?: boolean
  post_hint?: string
  preview?: {
    images: Array<{
      source: { url: string; width: number; height: number }
      resolutions: Array<{ url: string; width: number; height: number }>
    }>
  }
  gallery_data?: {
    items: Array<{ media_id: string; id: number }>
  }
  media_metadata?: Record<string, {
    status: string
    e: string
    m: string
    s: { u: string; x: number; y: number }
  }>
}

// Decode HTML entities in Reddit URLs
function decodeRedditUrl(url: string): string {
  return url.replace(/&amp;/g, '&')
}

// Extract image URLs from a Reddit post
function extractImagesFromPost(post: RedditPost): string[] {
  const images: string[] = []

  // Handle gallery posts
  if (post.is_gallery && post.gallery_data && post.media_metadata) {
    for (const item of post.gallery_data.items) {
      const media = post.media_metadata[item.media_id]
      if (media && media.s && media.s.u) {
        images.push(decodeRedditUrl(media.s.u))
      }
    }
    return images
  }

  // Handle preview images
  if (post.preview?.images) {
    for (const image of post.preview.images) {
      if (image.source?.url) {
        images.push(decodeRedditUrl(image.source.url))
      }
    }
    return images
  }

  // Handle direct image links
  if (post.url) {
    const url = post.url.toLowerCase()
    if (
      url.endsWith('.jpg') ||
      url.endsWith('.jpeg') ||
      url.endsWith('.png') ||
      url.endsWith('.webp') ||
      url.includes('i.redd.it') ||
      url.includes('i.imgur.com')
    ) {
      images.push(post.url)
    }
  }

  return images
}

// Check if post title/text contains robotaxi keywords
function containsRobotaxiKeywords(post: RedditPost): boolean {
  const text = `${post.title} ${post.selftext}`.toLowerCase()
  return ROBOTAXI_KEYWORDS.some(keyword => text.includes(keyword.toLowerCase()))
}

// Convert Reddit post to ScrapedPost
function toScrapedPost(post: RedditPost): ScrapedPost | null {
  const imageUrls = extractImagesFromPost(post)

  // Skip posts without images
  if (imageUrls.length === 0) {
    return null
  }

  // Skip videos
  if (post.is_video) {
    return null
  }

  return {
    source: 'reddit',
    sourceId: post.id,
    sourceUrl: `https://reddit.com${post.permalink}`,
    authorUsername: post.author,
    title: post.title,
    text: post.selftext,
    imageUrls,
    createdAt: new Date(post.created_utc * 1000),
    subreddit: post.subreddit,
  }
}

async function fetchRedditJson<T>(path: string): Promise<T> {
  let lastError: Error | null = null

  for (const baseUrl of REDDIT_BASE_URLS) {
    try {
      return await fetchJson<T>(`${baseUrl}${path}`)
    } catch (error) {
      lastError = error as Error
      logger.warn({ err: error, baseUrl, path }, 'Reddit request failed, trying fallback')
    }
  }

  throw lastError || new Error(`Failed to fetch Reddit JSON for ${path}`)
}

export class RedditScraper implements Scraper {
  name = 'reddit'

  async scrape(since: Date): Promise<ScrapedPost[]> {
    const posts: ScrapedPost[] = []
    const sinceTimestamp = since.getTime() / 1000

    logger.info({ since: since.toISOString() }, 'Starting Reddit scrape')

    // Scrape each target subreddit
    for (const subreddit of TARGET_SUBREDDITS) {
      try {
        const subredditPosts = await this.scrapeSubreddit(subreddit, sinceTimestamp)
        posts.push(...subredditPosts)
        logger.info({ subreddit, count: subredditPosts.length }, 'Scraped subreddit')

        // Delay between subreddits to avoid rate limiting
        await delay(2000)
      } catch (error) {
        logger.error({ subreddit, err: error }, 'Failed to scrape subreddit')
      }
    }

    // Also search across all of Reddit for robotaxi keywords
    try {
      const searchPosts = await this.searchReddit('robotaxi OR waymo OR cybercab', sinceTimestamp)

      // Dedupe by post ID
      const existingIds = new Set(posts.map(p => p.sourceId))
      for (const post of searchPosts) {
        if (!existingIds.has(post.sourceId)) {
          posts.push(post)
          existingIds.add(post.sourceId)
        }
      }
      logger.info({ count: searchPosts.length }, 'Scraped Reddit search')
    } catch (error) {
      logger.error({ err: error }, 'Failed to search Reddit')
    }

    return posts
  }

  private async scrapeSubreddit(subreddit: string, sinceTimestamp: number): Promise<ScrapedPost[]> {
    const posts: ScrapedPost[] = []
    const path = `/r/${subreddit}/new.json?limit=100&raw_json=1`
    const response = await fetchRedditJson<RedditListingResponse>(path)

    for (const child of response.data.children) {
      const post = child.data

      // Skip posts older than since
      if (post.created_utc < sinceTimestamp) {
        continue
      }

      // Only include posts with robotaxi keywords in target subreddits that aren't robotaxi-specific
      const isRobotaxiSubreddit = ROBOTAXI_SUBREDDITS.has(subreddit)
      if (!isRobotaxiSubreddit && !containsRobotaxiKeywords(post)) {
        continue
      }

      const scrapedPost = toScrapedPost(post)
      if (scrapedPost) {
        posts.push(scrapedPost)
      }
    }

    return posts
  }

  private async searchReddit(query: string, sinceTimestamp: number): Promise<ScrapedPost[]> {
    const posts: ScrapedPost[] = []
    const encodedQuery = encodeURIComponent(query)
    const path = `/search.json?q=${encodedQuery}&sort=new&limit=100&type=link&raw_json=1`
    const response = await fetchRedditJson<RedditListingResponse>(path)

    for (const child of response.data.children) {
      const post = child.data

      // Skip posts older than since
      if (post.created_utc < sinceTimestamp) {
        continue
      }

      const scrapedPost = toScrapedPost(post)
      if (scrapedPost) {
        posts.push(scrapedPost)
      }
    }

    return posts
  }
}
