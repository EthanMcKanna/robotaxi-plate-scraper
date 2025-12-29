/**
 * Create a bot user for the scraper to use when submitting vehicles.
 *
 * Usage:
 *   npm run seed:bot
 *
 * This will create or update the bot user and print the user ID.
 * Add this ID to your .env file as BOT_USER_ID.
 */

import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(__dirname, '..', '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

async function seedBotUser(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        username: 'robotaxi-scraper-bot',
        display_name: 'Robotaxi Scraper Bot',
        twitter_id: null,
        twitter_username: null,
        role: null, // Not an admin, just a regular submitter
      },
      {
        onConflict: 'username',
        ignoreDuplicates: false,
      }
    )
    .select()
    .single()

  if (error) {
    // If error is about duplicate, try to fetch existing user
    if (error.code === '23505' || error.message.includes('duplicate')) {
      const { data: existing, error: fetchError } = await supabase
        .from('users')
        .select()
        .eq('username', 'robotaxi-scraper-bot')
        .single()

      if (fetchError) {
        console.error('Failed to fetch existing bot user:', fetchError)
        process.exit(1)
      }

      console.log('Bot user already exists:')
      console.log(`  ID: ${existing.id}`)
      console.log(`  Username: ${existing.username}`)
      console.log('')
      console.log('Add this to your .env file:')
      console.log(`BOT_USER_ID=${existing.id}`)
      return
    }

    console.error('Failed to create bot user:', error)
    process.exit(1)
  }

  console.log('Bot user created/updated successfully:')
  console.log(`  ID: ${data.id}`)
  console.log(`  Username: ${data.username}`)
  console.log('')
  console.log('Add this to your .env file:')
  console.log(`BOT_USER_ID=${data.id}`)
}

seedBotUser().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
