import { getSupabase } from './supabase'

export type IbkrSyncInterval = 'manual' | 'hourly' | 'daily'

export interface IbkrSyncSettings {
  user_id: string
  flex_token: string
  flex_query_id: string
  auto_sync_enabled: boolean
  auto_sync_interval: IbkrSyncInterval
  last_sync_at: string | null
  last_sync_status: string | null
  last_sync_message: string | null
  last_sync_added: number | null
  last_sync_skipped: number | null
  updated_at: string
}

export interface IbkrSyncResult {
  mode: string
  added: number
  skipped: number
  account: string
  accountLabel?: string
  tradeCount: number
  warnings?: string[]
  error?: string
}

export async function fetchIbkrSyncSettings(): Promise<IbkrSyncSettings | null> {
  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('ibkr_sync_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return data as IbkrSyncSettings | null
}

export async function saveIbkrSyncSettings(input: {
  flex_token: string
  flex_query_id: string
  auto_sync_enabled: boolean
  auto_sync_interval: IbkrSyncInterval
}): Promise<void> {
  const supabase = getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('未登录')

  const { error } = await supabase.from('ibkr_sync_settings').upsert({
    user_id: user.id,
    flex_token: input.flex_token.trim(),
    flex_query_id: input.flex_query_id.trim(),
    auto_sync_enabled: input.auto_sync_enabled,
    auto_sync_interval: input.auto_sync_interval,
    updated_at: new Date().toISOString(),
  })

  if (error) throw error
}

export async function triggerIbkrSync(): Promise<IbkrSyncResult> {
  const supabase = getSupabase()
  const { data, error } = await supabase.functions.invoke('sync-ibkr', { body: {} })

  if (error) {
    const fnError = error as { context?: { json?: () => Promise<{ error?: string }> }; message?: string }
    if (fnError.context?.json) {
      try {
        const body = await fnError.context.json()
        if (body?.error) throw new Error(body.error)
      } catch (e) {
        if (e instanceof Error && e.message !== error.message) throw e
      }
    }
    throw new Error(error.message ?? '同步失败')
  }
  if (data?.error) throw new Error(data.error)
  return data as IbkrSyncResult
}
