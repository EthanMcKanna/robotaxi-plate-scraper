import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config } from '../config/index.js'

let supabase: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  }
  return supabase
}
