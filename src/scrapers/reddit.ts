import { XMLParser } from 'fast-xml-parser'
import { fetchWithRetry } from './http.js'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import { delay } from '../utils/delay.js'
import { TARGET_SUBREDDITS, ROBOTAXI_KEYWORDS, ROBOTAXI_SUBREDDITS } from '../config/search-terms.js'
import type { ScrapedPost, Scraper } from './types.js'

const REDDIT_RSS_BASE_URLS = [
  'https://www.reddit.com',
  'https://old.reddit.com',
]
const REDDIT_RSS_ACCEPT_HEADER = 'application/rss+xml, application/xml;q=0.9, */*;q=0.8'

const RSS_PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  textNodeName: '#text',
})

interface RedditRssItem {
  title?: string | { '#text'?: string }
  link?: string | { '#text'?: string; href?: string; rel?: string } | Array<{ '#text'?: string; href?: string; rel?: string }>
  guid?: string | { '#text'?: string }
  pubDate?: string | { '#text'?: string }
  published?: string | { '#text'?: string }
  'dc:creator'?: string | { '#text'?: string }
  author?: string | { '#text'?: string } | { name?: string }
  description?: string | { '#text'?: string }
  'content:encoded'?: string | { '#text'?: string }
  content?: string | { '#text'?: string }
  updated?: string | { '#text'?: string }
}

interface RedditRssChannel {
  item?: RedditRssItem | RedditRssItem[]
}

interface RedditRssResponse {
  rss?: {
    channel?: RedditRssChannel
  }
  feed?: {
    entry?: RedditRssItem | RedditRssItem[]
  }
}

// Decode HTML entities in Reddit URLs
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
}

function getTextValue(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value && '#text' in value) {
    const text = (value as { '#text'?: string })['#text']
    return typeof text === 'string' ? text : ''
  }
  return ''
}

function getLinkValue(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const candidate = value.find(entry => typeof entry === 'object' && entry && (entry as { rel?: string }).rel === 'alternate') || value[0]
    return getLinkValue(candidate)
  }
  if (typeof value === 'object') {
    const entry = value as { href?: string; '#text'?: string }
    if (typeof entry.href === 'string') return entry.href
    if (typeof entry['#text'] === 'string') return entry['#text']
  }
  return ''
}

function getAuthorName(item: RedditRssItem): string {
  const dcCreator = getTextValue(item['dc:creator'])
  if (dcCreator) return dcCreator
  const author = item.author
  if (!author) return ''
  if (typeof author === 'string') return author
  if (typeof author === 'object') {
    const name = (author as { name?: string })?.name
    if (typeof name === 'string') return name
    return getTextValue(author)
  }
  return ''
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function extractImageUrlsFromHtml(html: string): string[] {
  const urls = new Set<string>()
  if (!html) return []

  const decoded = decodeHtmlEntities(html)
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
  const linkRegex = /href=["']([^"']+)["']/gi

  let match: RegExpExecArray | null
  while ((match = imgRegex.exec(decoded)) !== null) {
    urls.add(match[1])
  }

  while ((match = linkRegex.exec(decoded)) !== null) {
    const url = match[1]
    const lower = url.toLowerCase()
    if (
      lower.includes('i.redd.it') ||
      lower.includes('i.imgur.com') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp')
    ) {
      urls.add(url)
    }
  }

  return Array.from(urls)
}

function extractImageUrlsFromItem(item: RedditRssItem): string[] {
  const content = getTextValue(item['content:encoded']) || getTextValue(item.content) || getTextValue(item.description)
  const urls = new Set(extractImageUrlsFromHtml(content))
  const link = getLinkValue(item.link)
  if (link) {
    const lower = link.toLowerCase()
    if (
      lower.includes('i.redd.it') ||
      lower.includes('i.imgur.com') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.png') ||
      lower.endsWith('.webp')
    ) {
      urls.add(link)
    }
  }

  return Array.from(urls)
}

function containsRobotaxiKeywords(text: string): boolean {
  const normalized = text.toLowerCase()
  return ROBOTAXI_KEYWORDS.some(keyword => normalized.includes(keyword.toLowerCase()))
}

function extractSubreddit(link: string): string {
  try {
    const url = new URL(link)
    const parts = url.pathname.split('/').filter(Boolean)
    const subredditIndex = parts.findIndex(part => part.toLowerCase() === 'r')
    if (subredditIndex >= 0 && parts[subredditIndex + 1]) {
      return parts[subredditIndex + 1]
    }
  } catch {
    // ignore invalid URLs
  }
  return 'reddit'
}

function extractPostId(guid: string, link: string): string {
  const guidText = guid.trim()
  if (guidText.startsWith('t3_')) {
    return guidText.slice(3)
  }
  const match = /comments\/([a-z0-9]+)/i.exec(link)
  if (match) {
    return match[1]
  }
  return guidText || link
}

function toScrapedPost(item: RedditRssItem): ScrapedPost | null {
  const link = getLinkValue(item.link)
  const title = getTextValue(item.title)
  const contentHtml = getTextValue(item['content:encoded']) || getTextValue(item.content) || getTextValue(item.description)
  const text = stripHtml(contentHtml)
  const imageUrls = extractImageUrlsFromItem(item)

  if (!link || imageUrls.length === 0) {
    return null
  }

  const pubDateText = getTextValue(item.pubDate) || getTextValue(item.published) || getTextValue(item.updated)
  const createdAt = pubDateText ? new Date(pubDateText) : new Date()
  const guid = getTextValue(item.guid)

  return {
    source: 'reddit',
    sourceId: extractPostId(guid || link, link),
    sourceUrl: link,
    authorUsername: getAuthorName(item) || 'unknown',
    title,
    text,
    imageUrls,
    createdAt,
    subreddit: extractSubreddit(link),
  }
}

function getRedditUserAgent(): string {
  return config.redditUserAgent || 'robotaxi-plate-scraper/0.1.0 (github.com/EthanMcKanna/robotaxi-plate-scraper)'
}

function normalizeRssItems(parsed: RedditRssResponse): RedditRssItem[] {
  const channelItems = parsed?.rss?.channel?.item
  if (channelItems) {
    return Array.isArray(channelItems) ? channelItems : [channelItems]
  }

  const feedItems = parsed?.feed?.entry
  if (feedItems) {
    return Array.isArray(feedItems) ? feedItems : [feedItems]
  }

  return []
}

async function fetchRedditRss(path: string): Promise<RedditRssItem[]> {
  let lastError: Error | null = null
  const userAgent = getRedditUserAgent()

  for (const baseUrl of REDDIT_RSS_BASE_URLS) {
    try {
      const response = await fetchWithRetry(`${baseUrl}${path}`, {
        headers: {
          'User-Agent': userAgent,
          'Accept': REDDIT_RSS_ACCEPT_HEADER,
        },
        retries: 2,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const xml = await response.text()
      const parsed = RSS_PARSER.parse(xml) as RedditRssResponse
      return normalizeRssItems(parsed)
    } catch (error) {
      lastError = error as Error
      logger.warn({ err: error, baseUrl, path }, 'Reddit request failed, trying fallback')
    }
  }

  throw lastError || new Error(`Failed to fetch Reddit RSS for ${path}`)
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
    const path = `/r/${subreddit}/new.rss?limit=100`
    const items = await fetchRedditRss(path)

    for (const item of items) {
      const link = getLinkValue(item.link)
      const contentHtml = getTextValue(item['content:encoded']) || getTextValue(item.content) || getTextValue(item.description)
      const text = stripHtml(`${getTextValue(item.title)} ${contentHtml}`)
      const pubDateText = getTextValue(item.pubDate) || getTextValue(item.published) || getTextValue(item.updated)
      const createdAt = pubDateText ? new Date(pubDateText) : null

      if (!createdAt) {
        continue
      }

      // Skip posts older than since
      if (createdAt.getTime() / 1000 < sinceTimestamp) {
        continue
      }

      // Only include posts with robotaxi keywords in target subreddits that aren't robotaxi-specific
      const isRobotaxiSubreddit = ROBOTAXI_SUBREDDITS.has(subreddit)
      if (!isRobotaxiSubreddit && !containsRobotaxiKeywords(text)) {
        continue
      }

      const scrapedPost = toScrapedPost(item)
      if (scrapedPost) {
        posts.push(scrapedPost)
      }
    }

    return posts
  }

  private async searchReddit(query: string, sinceTimestamp: number): Promise<ScrapedPost[]> {
    const posts: ScrapedPost[] = []
    const encodedQuery = encodeURIComponent(query)
    const path = `/search.rss?q=${encodedQuery}&sort=new&limit=100`
    const items = await fetchRedditRss(path)

    for (const item of items) {
      const pubDateText = getTextValue(item.pubDate) || getTextValue(item.published) || getTextValue(item.updated)
      const createdAt = pubDateText ? new Date(pubDateText) : null

      if (!createdAt) {
        continue
      }

      // Skip posts older than since
      if (createdAt.getTime() / 1000 < sinceTimestamp) {
        continue
      }

      const scrapedPost = toScrapedPost(item)
      if (scrapedPost) {
        posts.push(scrapedPost)
      }
    }

    return posts
  }
}
