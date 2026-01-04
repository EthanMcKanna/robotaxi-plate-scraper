import { spawn } from 'child_process'
import { logger } from '../utils/logger.js'
import type { ScrapedPost, Scraper } from './types.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PYTHON_SCRIPT = path.resolve(__dirname, 'python', 'scraper_cli.py')

export class LLMXScraper implements Scraper {
  name = 'llm-x'

  async scrape(since: Date): Promise<ScrapedPost[]> {
    return this.runPythonScraper('x', since)
  }

  private async runPythonScraper(source: 'reddit' | 'x', since: Date): Promise<ScrapedPost[]> {
    return new Promise((resolve, reject) => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:17',message:'runPythonScraper entry',data:{source, since:since.toISOString(), scriptPath:PYTHON_SCRIPT, cwd:path.resolve(__dirname, '..', '..', '..')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C'})}).catch(()=>{});
      // #endregion
      
      // Run script directly
      const args = [PYTHON_SCRIPT, source, '--since', since.toISOString()]
      const cwd = path.resolve(__dirname, '..', '..', '..')
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:25',message:'Before spawn',data:{args, cwd, pythonCmd:'python3'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,E'})}).catch(()=>{});
      // #endregion
      
      const python = spawn('python3', args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''

      python.stdout.on('data', (data) => {
        stdout += data.toString()
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:35',message:'stdout data chunk',data:{chunkLength:data.toString().length, totalStdoutLength:stdout.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
        // #endregion
      })

      python.stderr.on('data', (data) => {
        stderr += data.toString()
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:42',message:'stderr data chunk',data:{chunkLength:data.toString().length, totalStderrLength:stderr.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
      })

      python.on('close', (code) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:47',message:'Process closed',data:{exitCode:code, stdoutLength:stdout.length, stderrLength:stderr.length, stdoutPreview:stdout.substring(0,200), stderrPreview:stderr.substring(0,200)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B,C'})}).catch(()=>{});
        // #endregion
        
        if (code !== 0) {
          logger.error({ code, stderr, source }, 'Python scraper failed')
          reject(new Error(`Python scraper exited with code ${code}: ${stderr}`))
          return
        }

        try {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:57',message:'Before JSON.parse',data:{stdoutLength:stdout.length, stdoutIsEmpty:stdout.length===0},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          const posts = JSON.parse(stdout) as ScrapedPost[]
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:62',message:'JSON.parse success',data:{postCount:posts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          
          // Convert ISO strings to Date objects
          const parsedPosts = posts.map((post, index) => {
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:66',message:'Before Date conversion',data:{index, createdAtValue:post.createdAt, createdAtType:typeof post.createdAt},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            const createdAt = new Date(post.createdAt)
            
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:71',message:'Date conversion success',data:{index, createdAtISO:createdAt.toISOString()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
            // #endregion
            
            return {
              ...post,
              createdAt,
            }
          })
          
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:78',message:'runPythonScraper success',data:{postCount:parsedPosts.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A,B,C,D'})}).catch(()=>{});
          // #endregion
          
          resolve(parsedPosts)
        } catch (error) {
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:84',message:'Parse/convert error',data:{errorMessage:error instanceof Error ? error.message : String(error), errorType:error instanceof Error ? error.constructor.name : typeof error, stdoutLength:stdout.length, stdoutPreview:stdout.substring(0,500)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C,D'})}).catch(()=>{});
          // #endregion
          
          logger.error({ error, stdout, source }, 'Failed to parse Python scraper output')
          reject(error)
        }
      })

      python.on('error', (error) => {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/94b75132-d1e1-4153-92f4-66b0f408c290',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'llm-x.ts:92',message:'Process spawn error',data:{errorMessage:error.message, errorCode:(error as any).code, errorErrno:(error as any).errno},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'E'})}).catch(()=>{});
        // #endregion
        
        logger.error({ error, source }, 'Failed to spawn Python scraper')
        reject(error)
      })
    })
  }
}

