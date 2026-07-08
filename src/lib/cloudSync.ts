import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Trade, JournalEntry, AccountProfile } from '../types'
import { getSupabase } from './supabase'

export type CloudData = {
  trades: Trade[]
  journal: JournalEntry[]
  profiles: AccountProfile[]
}

interface TradeRow {
  id: string
  user_id: string
  symbol: string
  side: string
  status: string
  asset_class: string | null
  entry_date: string
  exit_date: string | null
  entry_price: number
  exit_price: number | null
  quantity: number
  fees: number
  pnl: number
  r_multiple: number | null
  setup: string | null
  tags: string[]
  notes: string | null
  account: string
  created_at: string
  updated_at: string
}

interface JournalRow {
  id: string
  user_id: string
  date: string
  account: string
  mood: string | null
  market_condition: string | null
  pre_market_plan: string | null
  post_market_review: string | null
  lessons: string | null
  goals: string | null
  rating: number | null
  created_at: string
  updated_at: string
}

interface ProfileRow {
  user_id: string
  account_id: string
  label: string
  type: string
  created_at: string
}

function rowToTrade(row: TradeRow): Trade {
  return {
    id: row.id,
    symbol: row.symbol,
    side: row.side as Trade['side'],
    status: row.status as Trade['status'],
    assetClass: (row.asset_class as Trade['assetClass']) ?? undefined,
    entryDate: row.entry_date,
    exitDate: row.exit_date ?? undefined,
    entryPrice: Number(row.entry_price),
    exitPrice: row.exit_price != null ? Number(row.exit_price) : undefined,
    quantity: Number(row.quantity),
    fees: Number(row.fees),
    pnl: Number(row.pnl),
    rMultiple: row.r_multiple != null ? Number(row.r_multiple) : undefined,
    setup: row.setup ?? undefined,
    tags: row.tags ?? [],
    notes: row.notes ?? undefined,
    account: row.account,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function tradeToRow(trade: Trade, userId: string): TradeRow {
  return {
    id: trade.id,
    user_id: userId,
    symbol: trade.symbol,
    side: trade.side,
    status: trade.status,
    asset_class: trade.assetClass ?? null,
    entry_date: trade.entryDate,
    exit_date: trade.exitDate ?? null,
    entry_price: trade.entryPrice,
    exit_price: trade.exitPrice ?? null,
    quantity: trade.quantity,
    fees: trade.fees,
    pnl: trade.pnl,
    r_multiple: trade.rMultiple ?? null,
    setup: trade.setup ?? null,
    tags: trade.tags,
    notes: trade.notes ?? null,
    account: trade.account,
    created_at: trade.createdAt,
    updated_at: trade.updatedAt,
  }
}

function rowToJournal(row: JournalRow): JournalEntry {
  return {
    id: row.id,
    date: row.date,
    account: row.account,
    mood: row.mood ?? undefined,
    marketCondition: row.market_condition ?? undefined,
    preMarketPlan: row.pre_market_plan ?? undefined,
    postMarketReview: row.post_market_review ?? undefined,
    lessons: row.lessons ?? undefined,
    goals: row.goals ?? undefined,
    rating: row.rating ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function journalToRow(entry: JournalEntry, userId: string): JournalRow {
  return {
    id: entry.id,
    user_id: userId,
    date: entry.date,
    account: entry.account,
    mood: entry.mood ?? null,
    market_condition: entry.marketCondition ?? null,
    pre_market_plan: entry.preMarketPlan ?? null,
    post_market_review: entry.postMarketReview ?? null,
    lessons: entry.lessons ?? null,
    goals: entry.goals ?? null,
    rating: entry.rating ?? null,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  }
}

function rowToProfile(row: ProfileRow): AccountProfile {
  return {
    id: row.account_id,
    label: row.label,
    type: row.type as AccountProfile['type'],
    createdAt: row.created_at,
  }
}

function profileToRow(profile: AccountProfile, userId: string): ProfileRow {
  return {
    user_id: userId,
    account_id: profile.id,
    label: profile.label,
    type: profile.type,
    created_at: profile.createdAt,
  }
}

export async function fetchAllData(userId: string): Promise<CloudData> {
  const supabase = getSupabase()

  const [tradesRes, journalRes, profilesRes] = await Promise.all([
    supabase.from('trades').select('*').eq('user_id', userId),
    supabase.from('journal_entries').select('*').eq('user_id', userId),
    supabase.from('account_profiles').select('*').eq('user_id', userId),
  ])

  if (tradesRes.error) throw tradesRes.error
  if (journalRes.error) throw journalRes.error
  if (profilesRes.error) throw profilesRes.error

  return {
    trades: (tradesRes.data as TradeRow[]).map(rowToTrade),
    journal: (journalRes.data as JournalRow[]).map(rowToJournal),
    profiles: (profilesRes.data as ProfileRow[]).map(rowToProfile),
  }
}

export async function uploadAllData(userId: string, data: CloudData): Promise<void> {
  const supabase = getSupabase()

  if (data.profiles.length > 0) {
    const { error } = await supabase
      .from('account_profiles')
      .upsert(data.profiles.map((p) => profileToRow(p, userId)))
    if (error) throw error
  }

  if (data.trades.length > 0) {
    const batchSize = 200
    for (let i = 0; i < data.trades.length; i += batchSize) {
      const batch = data.trades.slice(i, i + batchSize).map((t) => tradeToRow(t, userId))
      const { error } = await supabase.from('trades').upsert(batch)
      if (error) throw error
    }
  }

  if (data.journal.length > 0) {
    const { error } = await supabase
      .from('journal_entries')
      .upsert(data.journal.map((j) => journalToRow(j, userId)))
    if (error) throw error
  }
}

export async function upsertTrade(userId: string, trade: Trade): Promise<void> {
  const { error } = await getSupabase().from('trades').upsert(tradeToRow(trade, userId))
  if (error) throw error
}

export async function deleteTradeCloud(userId: string, id: string): Promise<void> {
  const { error } = await getSupabase().from('trades').delete().eq('user_id', userId).eq('id', id)
  if (error) throw error
}

export async function upsertTrades(userId: string, trades: Trade[]): Promise<void> {
  if (trades.length === 0) return
  const batchSize = 200
  for (let i = 0; i < trades.length; i += batchSize) {
    const batch = trades.slice(i, i + batchSize).map((t) => tradeToRow(t, userId))
    const { error } = await getSupabase().from('trades').upsert(batch)
    if (error) throw error
  }
}

export async function deleteTradesByAccount(userId: string, accountId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('trades')
    .delete()
    .eq('user_id', userId)
    .eq('account', accountId)
  if (error) throw error
}

export async function upsertJournal(userId: string, entry: JournalEntry): Promise<void> {
  const { error } = await getSupabase().from('journal_entries').upsert(journalToRow(entry, userId))
  if (error) throw error
}

export async function deleteJournalCloud(userId: string, id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('journal_entries')
    .delete()
    .eq('user_id', userId)
    .eq('id', id)
  if (error) throw error
}

export async function deleteJournalByAccount(userId: string, accountId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('journal_entries')
    .delete()
    .eq('user_id', userId)
    .eq('account', accountId)
  if (error) throw error
}

export async function upsertProfile(userId: string, profile: AccountProfile): Promise<void> {
  const { error } = await getSupabase()
    .from('account_profiles')
    .upsert(profileToRow(profile, userId))
  if (error) throw error
}

export async function deleteProfileCloud(userId: string, accountId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('account_profiles')
    .delete()
    .eq('user_id', userId)
    .eq('account_id', accountId)
  if (error) throw error
}

export function subscribeToChanges(
  userId: string,
  onChange: () => void
): RealtimeChannel {
  const supabase = getSupabase()
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 400)
  }

  const channel = supabase
    .channel(`trade-journal-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trades', filter: `user_id=eq.${userId}` },
      schedule
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'journal_entries', filter: `user_id=eq.${userId}` },
      schedule
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'account_profiles', filter: `user_id=eq.${userId}` },
      schedule
    )
    .subscribe()

  return channel
}
