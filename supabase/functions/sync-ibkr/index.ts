import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { fetchIbkrFlexCsv } from '../_shared/flexApi.ts'
import {
  parseIbkrStatementText,
  type ParsedTrade,
  type ParsedFinancials,
} from '../_shared/ibkrParser.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

interface SyncSettings {
  user_id: string
  flex_token: string
  flex_query_id: string
  auto_sync_enabled: boolean
  auto_sync_interval: string
  last_sync_at: string | null
}

function formatSyncError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const record = e as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : ''
    const details = typeof record.details === 'string' ? record.details : ''
    const hint = typeof record.hint === 'string' ? record.hint : ''
    if (message && details) return `${message} (${details})`
    if (message) return message
    if (details) return details
    if (hint) return hint
  }
  return '未知错误'
}

function inferAccountType(trades: ParsedTrade[]): string {
  const futures = trades.filter((t) => t.assetClass === 'futures').length
  const stocks = trades.filter((t) => t.assetClass === 'stock').length
  if (futures > stocks) return 'futures'
  if (stocks > futures) return 'stock'
  return 'other'
}

function tradeToRow(trade: ParsedTrade, userId: string) {
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
    r_multiple: null,
    setup: trade.setup ?? null,
    tags: trade.tags,
    notes: trade.notes ?? null,
    account: trade.account,
    created_at: trade.createdAt,
    updated_at: trade.updatedAt,
  }
}

async function upsertProfile(
  supabase: SupabaseClient,
  userId: string,
  accountId: string,
  accountLabel: string,
  trades: ParsedTrade[],
  financials: ParsedFinancials | null
) {
  const { data: existing } = await supabase
    .from('account_profiles')
    .select('*')
    .eq('user_id', userId)
    .eq('account_id', accountId)
    .maybeSingle()

  const accountTrades = trades.filter((t) => t.account === accountId)
  const now = new Date().toISOString()
  const label =
    existing?.label && existing.label !== accountId ? existing.label : accountLabel

  const reliableFinancials =
    financials &&
    (
      (financials.navHistory?.length ?? 0) > 0 ||
      (financials.cashFlows?.length ?? 0) > 0 ||
      (financials.totalDeposits ?? 0) > 0 ||
      (financials.currentCapital ?? 0) > 0
    )
      ? financials
      : null

  const profile = {
    user_id: userId,
    account_id: accountId,
    label,
    type: existing?.type ?? inferAccountType(accountTrades),
    created_at: existing?.created_at ?? now,
    starting_capital:
      reliableFinancials?.navHistory?.length
        ? (reliableFinancials.startingCapital ?? existing?.starting_capital ?? null)
        : (existing?.starting_capital ?? reliableFinancials?.startingCapital ?? null),
    current_capital: reliableFinancials?.currentCapital ?? existing?.current_capital ?? null,
    total_deposits: Math.max(
      existing?.total_deposits ?? 0,
      reliableFinancials?.totalDeposits ?? 0,
      (reliableFinancials?.cashFlows ?? existing?.cash_flows ?? [])
        .filter((flow: { amount: number }) => flow.amount > 0)
        .reduce((sum: number, flow: { amount: number }) => sum + flow.amount, 0)
    ) || null,
    total_withdrawals: Math.max(
      existing?.total_withdrawals ?? 0,
      reliableFinancials?.totalWithdrawals ?? 0
    ) || null,
    cash_flows: (() => {
      const merged = [...(existing?.cash_flows ?? [])]
      for (const flow of reliableFinancials?.cashFlows ?? []) {
        if (!merged.some((f) => f.date === flow.date && Math.abs(f.amount - flow.amount) < 0.01)) {
          merged.push(flow)
        }
      }
      return merged.length > 0 ? merged : (existing?.cash_flows ?? [])
    })(),
    nav_history: reliableFinancials?.navHistory?.length
      ? reliableFinancials.navHistory
      : (existing?.nav_history ?? []),
  }

  let { error } = await supabase.from('account_profiles').upsert(profile)
  if (error && String(error.message).includes('nav_history')) {
    const { nav_history: _nav, ...profileWithoutNav } = profile
    const retry = await supabase.from('account_profiles').upsert(profileWithoutNav)
    error = retry.error
  }
  if (error) throw error
}

async function cleanupPlaceholderAccounts(
  supabase: SupabaseClient,
  userId: string,
  realAccountId: string
) {
  const { data: profiles } = await supabase
    .from('account_profiles')
    .select('account_id')
    .eq('user_id', userId)

  for (const profile of profiles ?? []) {
    const placeholderId = profile.account_id
    if (!placeholderId || placeholderId === realAccountId) continue
    if (placeholderId !== 'IBKR' && !placeholderId.startsWith('IBKR')) continue

    const { count } = await supabase
      .from('trades')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('account', placeholderId)

    if ((count ?? 0) === 0) {
      await supabase
        .from('account_profiles')
        .delete()
        .eq('user_id', userId)
        .eq('account_id', placeholderId)
    }
  }
}

async function syncUser(supabase: SupabaseClient, settings: SyncSettings) {
  const csv = await fetchIbkrFlexCsv(settings.flex_token, settings.flex_query_id)
  const parsed = parseIbkrStatementText(csv)

  const { count: removedCount, error: deleteError } = await supabase
    .from('trades')
    .delete({ count: 'exact' })
    .eq('user_id', settings.user_id)
    .eq('account', parsed.account)

  if (deleteError) throw deleteError

  if (parsed.trades.length > 0) {
    const batchSize = 100
    for (let i = 0; i < parsed.trades.length; i += batchSize) {
      const batch = parsed.trades.slice(i, i + batchSize).map((t) => tradeToRow(t, settings.user_id))
      const { error } = await supabase.from('trades').insert(batch)
      if (error) throw error
    }
  }

  await upsertProfile(
    supabase,
    settings.user_id,
    parsed.account,
    parsed.accountLabel,
    parsed.trades,
    parsed.financials
  )
  await cleanupPlaceholderAccounts(supabase, settings.user_id, parsed.account)

  const now = new Date().toISOString()
  const tradePnl = parsed.trades
    .filter((t) => t.status === 'closed')
    .reduce((sum, t) => sum + t.pnl, 0)

  await supabase
    .from('ibkr_sync_settings')
    .update({
      last_sync_at: now,
      last_sync_status: 'success',
      last_sync_message: parsed.errors.length > 0 ? parsed.errors.slice(0, 3).join('; ') : '同步成功',
      last_sync_added: parsed.trades.length,
      last_sync_skipped: removedCount ?? 0,
      updated_at: now,
    })
    .eq('user_id', settings.user_id)

  return {
    added: parsed.trades.length,
    skipped: removedCount ?? 0,
    account: parsed.account,
    accountLabel: parsed.accountLabel,
    tradeCount: parsed.trades.length,
    tradePnl,
    warnings: parsed.errors,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const cronSecret = Deno.env.get('CRON_SECRET')

    const authHeader = req.headers.get('Authorization')
    const incomingCronSecret = req.headers.get('x-cron-secret')

    // 定时任务：使用 service role 同步所有开启自动同步的用户
    if (incomingCronSecret && cronSecret && incomingCronSecret === cronSecret && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey)
      const url = new URL(req.url)
      const intervalFilter = url.searchParams.get('interval')

      let query = admin.from('ibkr_sync_settings').select('*').eq('auto_sync_enabled', true)
      if (intervalFilter === 'hourly' || intervalFilter === 'daily') {
        query = query.eq('auto_sync_interval', intervalFilter)
      }

      const { data: allSettings, error } = await query

      if (error) throw error

      const results = []
      for (const settings of allSettings ?? []) {
        try {
          const result = await syncUser(admin, settings as SyncSettings)
          results.push({ user_id: settings.user_id, ok: true, ...result })
        } catch (e) {
          const msg = formatSyncError(e)
          await admin
            .from('ibkr_sync_settings')
            .update({
              last_sync_status: 'error',
              last_sync_message: msg,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', settings.user_id)
          results.push({ user_id: settings.user_id, ok: false, error: msg })
        }
      }

      return new Response(JSON.stringify({ mode: 'cron', results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 用户手动同步
    if (!authHeader) {
      return new Response(JSON.stringify({ error: '未登录' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: '登录无效' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: settings, error: settingsError } = await supabase
      .from('ibkr_sync_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (settingsError) throw settingsError
    if (!settings?.flex_token || !settings?.flex_query_id) {
      return new Response(JSON.stringify({ error: '请先在 IBKR 同步页面配置 Flex Token 和 Query ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: '服务端未配置 SUPABASE_SERVICE_ROLE_KEY' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const result = await syncUser(admin, { ...(settings as SyncSettings), user_id: user.id })

    return new Response(JSON.stringify({ mode: 'manual', ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const message = formatSyncError(e)

    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      const authHeader = req.headers.get('Authorization')
      if (supabaseUrl && serviceRoleKey && authHeader) {
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
        const authClient = createClient(supabaseUrl, anonKey, {
          global: { headers: { Authorization: authHeader } },
        })
        const { data: { user } } = await authClient.auth.getUser()
        if (user) {
          const admin = createClient(supabaseUrl, serviceRoleKey)
          await admin
            .from('ibkr_sync_settings')
            .update({
              last_sync_status: 'error',
              last_sync_message: message,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
        }
      }
    } catch {
      // ignore secondary logging errors
    }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
