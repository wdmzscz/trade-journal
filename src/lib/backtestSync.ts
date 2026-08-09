import { getSupabase } from './supabase'
import type { BacktestSettings, BacktestTrade } from '../types/backtest'
import { DEFAULT_BACKTEST_SETTINGS } from '../types/backtest'

type WorkspaceRow = {
  user_id: string
  settings: BacktestSettings
  trades: BacktestTrade[]
  updated_at: string
}

export async function fetchBacktestWorkspace(userId: string): Promise<{
  settings: BacktestSettings
  trades: BacktestTrade[]
} | null> {
  const { data, error } = await getSupabase()
    .from('backtest_workspaces')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  if (!data) return null

  const row = data as WorkspaceRow
  return {
    settings: { ...DEFAULT_BACKTEST_SETTINGS, ...(row.settings ?? {}) },
    trades: Array.isArray(row.trades) ? row.trades : [],
  }
}

export async function upsertBacktestWorkspace(
  userId: string,
  settings: BacktestSettings,
  trades: BacktestTrade[]
): Promise<void> {
  const { error } = await getSupabase().from('backtest_workspaces').upsert({
    user_id: userId,
    settings,
    trades,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
}
