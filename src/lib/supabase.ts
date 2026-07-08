import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export function isCloudEnabled(): boolean {
  return Boolean(url && anonKey)
}

let client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('Supabase 未配置，请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY')
  }
  if (!client) {
    client = createClient(url, anonKey)
  }
  return client
}
