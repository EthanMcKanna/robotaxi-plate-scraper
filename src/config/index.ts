import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ENV_PATH = path.resolve(__dirname, '..', '..', '.env')
export const ENV_EXAMPLE_PATH = path.resolve(__dirname, '..', '..', '.env.example')

dotenv.config({ path: ENV_PATH })

export interface ScraperConfig {
  // Required
  geminiApiKey: string
  supabaseUrl: string
  supabaseServiceKey: string
  botUserId: string

  // Scraper settings
  scrapeIntervalMinutes: number
  lookbackHours: number
  logLevel: string

  // Feature flags
  enableReddit: boolean
  enableLLMReddit: boolean
  enableLLMX: boolean

  // Concurrency
  maxConcurrentScrapers: number
}

function getEnvVar(name: string): string {
  return process.env[name] || ''
}

function getEnvBool(name: string, defaultValue: boolean): boolean {
  const value = process.env[name]
  if (value === undefined) return defaultValue
  return value.toLowerCase() === 'true' || value === '1'
}

function getEnvInt(name: string, defaultValue: number): number {
  const value = process.env[name]
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return Number.isNaN(parsed) ? defaultValue : parsed
}

function loadConfigFromEnv(): ScraperConfig {
  return {
    // Required
    geminiApiKey: getEnvVar('GEMINI_API_KEY'),
    supabaseUrl: getEnvVar('SUPABASE_URL'),
    supabaseServiceKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY'),
    botUserId: getEnvVar('BOT_USER_ID'),

    // Scraper settings
    scrapeIntervalMinutes: getEnvInt('SCRAPE_INTERVAL_MINUTES', 15),
    lookbackHours: getEnvInt('LOOKBACK_HOURS', 2),
    logLevel: process.env.LOG_LEVEL || 'info',

    // Feature flags
    enableReddit: getEnvBool('ENABLE_REDDIT', true),
    enableLLMReddit: getEnvBool('ENABLE_LLM_REDDIT', false),
    enableLLMX: getEnvBool('ENABLE_LLM_X', false),

    // Concurrency
    maxConcurrentScrapers: getEnvInt('MAX_CONCURRENT_SCRAPERS', 3),
  }
}

export let config: ScraperConfig = loadConfigFromEnv()

export function reloadConfig(): void {
  config = loadConfigFromEnv()
}

export function getMissingRequiredConfig(): string[] {
  const required = ['geminiApiKey', 'supabaseUrl', 'supabaseServiceKey', 'botUserId'] as const
  return required.filter(key => !config[key])
}

export function validateConfig(): void {
  const missing = getMissingRequiredConfig()
  if (missing.length > 0) {
    throw new Error(`Missing required config: ${missing.join(', ')}`)
  }
}
