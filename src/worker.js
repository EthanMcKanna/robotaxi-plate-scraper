import { Container, getContainer } from '@cloudflare/containers'

export class PlateCollector extends Container {
  sleepAfter = '2m'
}

function jobEnvironment(env) {
  return {
    GEMINI_API_KEY: env.GEMINI_API_KEY,
    BOT_USER_ID: env.BOT_USER_ID,
    ROBOTAXI_INGEST_URL: env.ROBOTAXI_INGEST_URL,
    ROBOTAXI_INGEST_SECRET: env.ROBOTAXI_INGEST_SECRET,
    ROBOTAXI_INGEST_REQUIRED: 'true',
    LOOKBACK_HOURS: env.LOOKBACK_HOURS,
    MAX_CONCURRENT_SCRAPERS: env.MAX_CONCURRENT_SCRAPERS,
    LOG_LEVEL: env.LOG_LEVEL,
    ENABLE_REDDIT: env.ENABLE_REDDIT,
    REDDIT_USER_AGENT: env.REDDIT_USER_AGENT || '',
  }
}

async function startJob(env) {
  const container = getContainer(env.PLATE_COLLECTOR, 'scheduled')
  await container.start({
    entrypoint: ['node', 'dist/scripts/run-once.js'],
    envVars: jobEnvironment(env),
    enableInternet: true,
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        producer: 'robotaxi-plate-scraper',
        runtime: 'cloudflare-container',
        configured: Boolean(env.GEMINI_API_KEY && env.BOT_USER_ID && env.ROBOTAXI_INGEST_SECRET && env.RUN_TOKEN),
      })
    }
    if (request.method === 'POST' && url.pathname === '/run') {
      const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
      if (!env.RUN_TOKEN || token !== env.RUN_TOKEN) return new Response('Unauthorized', { status: 401 })
      await startJob(env)
      return Response.json({ accepted: true }, { status: 202 })
    }
    return new Response('Not found', { status: 404 })
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(startJob(env))
  },
}
