/**
 * Interactive setup to create/update .env and login sessions.
 *
 * Usage:
 *   npm run setup
 */

import { ensureConfigInteractive } from '../src/config/interactive-setup.js'
import { validateConfig } from '../src/config/index.js'

async function main(): Promise<void> {
  await ensureConfigInteractive({ force: true })
  validateConfig()
  console.log('Setup complete.')
}

main().catch(error => {
  console.error('Setup failed:', error)
  process.exit(1)
})
