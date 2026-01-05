import { spawn } from 'child_process'
import { logger } from '../utils/logger.js'
import type { ScrapedPost, Scraper } from './types.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_SCRIPT = path.resolve(__dirname, 'python', 'scraper_cli.py')

export class LLMRedditScraper implements Scraper {
  name = 'llm-reddit'

  async scrape(since: Date): Promise<ScrapedPost[]> {
    return this.runPythonScraper('reddit', since)
  }

  private async runPythonScraper(source: 'reddit' | 'x', since: Date): Promise<ScrapedPost[]> {
    return new Promise((resolve, reject) => {
      // Run script directly
      const args = [PYTHON_SCRIPT, source, '--since', since.toISOString()]
      const python = spawn('python3', args, {
        cwd: path.resolve(__dirname, '..', '..', '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      python.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      python.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      python.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr, source }, 'Python scraper failed')
          reject(new Error(`Python scraper exited with code ${code}: ${stderr}`))
          return
        }

        try {
          const posts = JSON.parse(stdout) as ScrapedPost[]
          // Convert ISO strings to Date objects
          const parsedPosts = posts.map((post) => ({
            ...post,
            createdAt: new Date(post.createdAt),
          }))
          resolve(parsedPosts)
        } catch (error) {
          logger.error({ error, stdout, source }, 'Failed to parse Python scraper output')
          reject(error)
        }
      })

      python.on('error', (error) => {
        logger.error({ error, source }, 'Failed to spawn Python scraper')
        reject(error)
      })
    })
  }
}

