import dotenv from 'dotenv'
import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import path from 'path'
import readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import { ENV_EXAMPLE_PATH, ENV_PATH, config, getMissingRequiredConfig, reloadConfig } from './index.js'

type EnvMap = Record<string, string>
type ReadlineInterface = ReturnType<typeof readline.createInterface>

interface EnsureConfigOptions {
  force?: boolean
}

function parseEnvFile(content: string): EnvMap {
  const values: EnvMap = {}
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!match) continue
    const key = match[1]
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }
  return values
}

function formatEnvValue(value: string): string {
  if (value === '') return ''
  if (/[\s#]/.test(value)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    return `"${escaped}"`
  }
  return value
}

function setEnvValue(template: string, key: string, value: string): string {
  const formatted = `${key}=${formatEnvValue(value)}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  if (pattern.test(template)) {
    return template.replace(pattern, formatted)
  }
  return `${template.trimEnd()}\n${formatted}\n`
}

async function writeEnvFile(values: EnvMap): Promise<void> {
  let template = ''
  if (existsSync(ENV_EXAMPLE_PATH)) {
    template = await readFile(ENV_EXAMPLE_PATH, 'utf8')
  }

  if (!template) {
    const lines = Object.entries(values).map(([key, value]) => `${key}=${formatEnvValue(value)}`)
    await writeFile(ENV_PATH, `${lines.join('\n')}\n`)
    return
  }

  let output = template
  for (const [key, value] of Object.entries(values)) {
    output = setEnvValue(output, key, value)
  }

  await writeFile(ENV_PATH, output)
}

async function askYesNo(rl: ReadlineInterface, question: string, defaultValue: boolean): Promise<boolean> {
  const suffix = defaultValue ? 'Y/n' : 'y/N'
  const answer = (await rl.question(`${question} (${suffix}): `)).trim().toLowerCase()
  if (!answer) return defaultValue
  return answer === 'y' || answer === 'yes'
}

async function askValue(
  rl: ReadlineInterface,
  label: string,
  existing: string,
  required: boolean
): Promise<string> {
  const prompt = existing ? `${label} [${existing}]: ` : `${label}: `
  while (true) {
    const answer = (await rl.question(prompt)).trim()
    if (answer) return answer
    if (existing) return existing
    if (!required) return ''
  }
}

export async function ensureConfigInteractive(options: EnsureConfigOptions = {}): Promise<void> {
  if (!process.stdin.isTTY) return

  const envExists = existsSync(ENV_PATH)
  const missingRequired = getMissingRequiredConfig()
  const shouldPromptOptional = options.force || !envExists

  if (!options.force && envExists && missingRequired.length === 0) {
    return
  }

  console.log('Missing configuration detected. Starting interactive setup...')

  const existingValues: EnvMap = envExists
    ? parseEnvFile(await readFile(ENV_PATH, 'utf8'))
    : {}

  const values: EnvMap = { ...existingValues }

  const rl = readline.createInterface({ input, output })

  values.GEMINI_API_KEY = await askValue(
    rl,
    'GEMINI_API_KEY',
    values.GEMINI_API_KEY || config.geminiApiKey,
    true
  )
  values.SUPABASE_URL = await askValue(
    rl,
    'SUPABASE_URL',
    values.SUPABASE_URL || config.supabaseUrl,
    true
  )
  values.SUPABASE_SERVICE_ROLE_KEY = await askValue(
    rl,
    'SUPABASE_SERVICE_ROLE_KEY',
    values.SUPABASE_SERVICE_ROLE_KEY || config.supabaseServiceKey,
    true
  )
  values.BOT_USER_ID = await askValue(
    rl,
    'BOT_USER_ID (run npm run seed:bot if needed)',
    values.BOT_USER_ID || config.botUserId,
    true
  )

  if (shouldPromptOptional) {
    const existingRedditEnabled = (values.ENABLE_REDDIT ?? '').toLowerCase() === 'true'
    const enableReddit = await askYesNo(rl, 'Enable Reddit scraper', existingRedditEnabled || config.enableReddit)
    values.ENABLE_REDDIT = enableReddit ? 'true' : 'false'
    
    const existingLLMRedditEnabled = (values.ENABLE_LLM_REDDIT ?? '').toLowerCase() === 'true'
    const enableLLMReddit = await askYesNo(rl, 'Enable LLM-enhanced Reddit scraper (requires OPENAI_API_KEY)', existingLLMRedditEnabled || config.enableLLMReddit)
    values.ENABLE_LLM_REDDIT = enableLLMReddit ? 'true' : 'false'
    
    if (enableLLMReddit && !values.OPENAI_API_KEY) {
      values.OPENAI_API_KEY = await askValue(
        rl,
        'OPENAI_API_KEY (required for LLM scrapers)',
        values.OPENAI_API_KEY || '',
        true
      )
    }
    
    const existingLLMXEnabled = (values.ENABLE_LLM_X ?? '').toLowerCase() === 'true'
    const enableLLMX = await askYesNo(rl, 'Enable LLM-enhanced X/Twitter scraper (requires OPENAI_API_KEY and Google API keys)', existingLLMXEnabled || config.enableLLMX)
    values.ENABLE_LLM_X = enableLLMX ? 'true' : 'false'
    
    if (enableLLMX) {
      if (!values.OPENAI_API_KEY) {
        values.OPENAI_API_KEY = await askValue(
          rl,
          'OPENAI_API_KEY (required for LLM scrapers)',
          values.OPENAI_API_KEY || '',
          true
        )
      }
      if (!values.GOOGLE_API_KEY) {
        values.GOOGLE_API_KEY = await askValue(
          rl,
          'GOOGLE_API_KEY (optional, for X/Twitter scraper)',
          values.GOOGLE_API_KEY || '',
          false
        )
      }
      if (!values.GOOGLE_CSE_ID) {
        values.GOOGLE_CSE_ID = await askValue(
          rl,
          'GOOGLE_CSE_ID (optional, for X/Twitter scraper)',
          values.GOOGLE_CSE_ID || '',
          false
        )
      }
    }
  }

  rl.close()

  await writeEnvFile(values)
  dotenv.config({ path: ENV_PATH, override: true })
  reloadConfig()
}
