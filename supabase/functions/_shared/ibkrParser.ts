import Papa from 'npm:papaparse@5.4.1'

export interface ParsedTrade {
  id: string
  symbol: string
  side: 'long' | 'short'
  status: 'open' | 'closed'
  assetClass?: string
  entryDate: string
  exitDate?: string
  entryPrice: number
  exitPrice?: number
  quantity: number
  fees: number
  pnl: number
  setup?: string
  tags: string[]
  notes?: string
  account: string
  createdAt: string
  updatedAt: string
}

export interface ParsedFinancials {
  startingCapital: number
  currentCapital: number
  totalDeposits: number
  totalWithdrawals: number
  cashFlows: { date: string; amount: number; description?: string }[]
}

export interface ParseResult {
  trades: ParsedTrade[]
  account: string
  financials: ParsedFinancials | null
  errors: string[]
}

interface IbkrOrder {
  symbol: string
  assetClass: string
  currency: string
  datetime: string
  quantity: number
  price: number
  commission: number
  realizedPnl: number
  code: 'O' | 'C'
}

const TRADE_SECTIONS = new Set(['交易', 'Trades'])
const ACCOUNT_SECTIONS = new Set(['账户信息', 'Account Information'])
const NAV_CHANGE_SECTIONS = new Set(['净资产值变更', 'Change in NAV'])
const NAV_VALUE_SECTIONS = new Set(['净资产值', 'Net Asset Value'])
const DEPOSIT_SECTIONS = new Set(['存款和取款', 'Deposits & Withdrawals', 'Deposits and Withdrawals'])

function parseNumber(value: string | undefined, fallback = 0): number {
  if (!value || value === '--') return fallback
  const n = parseFloat(value.replace(/[$,]/g, ''))
  return Number.isNaN(n) ? fallback : n
}

function parseIbkrDateTime(value: string): string {
  const cleaned = value.replace(/"/g, '').trim()
  const d = new Date(cleaned)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

function normalizeAssetClass(value: string): string {
  const v = value.toLowerCase()
  if (v.includes('期货') || v.includes('future')) return 'futures'
  if (v.includes('股票') || v.includes('stock') || v.includes('equity')) return 'stock'
  if (v.includes('期权') || v.includes('option')) return 'option'
  if (v.includes('外汇') || v.includes('forex')) return 'forex'
  return 'other'
}

function assetClassLabel(assetClass: string): string {
  switch (assetClass) {
    case 'futures': return '期货'
    case 'stock': return '股票'
    case 'option': return '期权'
    case 'forex': return '外汇'
    default: return '其他'
  }
}

function extractAccount(rows: string[][]): string {
  for (const row of rows) {
    if (!ACCOUNT_SECTIONS.has(row[0])) continue
    if (row[1] !== 'Data') continue
    if (row[2] !== '账户' && row[2] !== 'Account') continue
    const account = row[3]?.trim()
    if (account) return account
  }
  return 'IBKR'
}

function extractOrders(rows: string[][]): IbkrOrder[] {
  const orders: IbkrOrder[] = []
  for (const row of rows) {
    if (!TRADE_SECTIONS.has(row[0]) || row[1] !== 'Data' || row[2] !== 'Order') continue
    const code = row[15]?.trim() as 'O' | 'C' | undefined
    if (code !== 'O' && code !== 'C') continue
    const symbol = row[5]?.trim()
    if (!symbol) continue
    orders.push({
      symbol,
      assetClass: row[3]?.trim() ?? '',
      currency: row[4]?.trim() ?? 'USD',
      datetime: row[6]?.trim() ?? '',
      quantity: parseNumber(row[7]),
      price: parseNumber(row[8]),
      commission: parseNumber(row[11]),
      realizedPnl: parseNumber(row[13]),
      code,
    })
  }
  return orders.sort((a, b) => parseIbkrDateTime(a.datetime).localeCompare(parseIbkrDateTime(b.datetime)))
}

function pairOrders(orders: IbkrOrder[], account: string): { trades: ParsedTrade[]; errors: string[] } {
  const trades: ParsedTrade[] = []
  const errors: string[] = []
  const openQueues = new Map<string, IbkrOrder[]>()

  for (const order of orders) {
    if (order.code === 'O') {
      const queue = openQueues.get(order.symbol) ?? []
      queue.push(order)
      openQueues.set(order.symbol, queue)
      continue
    }

    const queue = openQueues.get(order.symbol) ?? []
    const open = queue.shift()
    if (!open) {
      errors.push(`${order.symbol} 平仓单缺少开仓：${order.datetime}`)
      continue
    }

    const side = open.quantity > 0 ? 'long' : 'short'
    const assetClass = normalizeAssetClass(open.assetClass)
    const now = new Date().toISOString()

    trades.push({
      id: crypto.randomUUID(),
      symbol: order.symbol,
      side,
      status: 'closed',
      assetClass,
      entryDate: parseIbkrDateTime(open.datetime),
      exitDate: parseIbkrDateTime(order.datetime),
      entryPrice: open.price,
      exitPrice: order.price,
      quantity: Math.abs(open.quantity),
      fees: Math.abs(open.commission) + Math.abs(order.commission),
      pnl: order.realizedPnl,
      setup: assetClassLabel(assetClass),
      tags: [assetClassLabel(assetClass), open.currency],
      notes: `IBKR ${open.symbol}`,
      account,
      createdAt: now,
      updatedAt: now,
    })
  }

  return { trades, errors }
}

function extractFinancials(rows: string[][]): ParsedFinancials | null {
  const navFields = new Map<string, number>()
  let navTotal = 0
  const cashFlows: ParsedFinancials['cashFlows'] = []

  for (const row of rows) {
    if (NAV_CHANGE_SECTIONS.has(row[0]) && row[1] === 'Data' && row[2]) {
      navFields.set(row[2].trim(), parseNumber(row[3]))
    }
    if (NAV_VALUE_SECTIONS.has(row[0]) && row[1] === 'Data') {
      const assetType = row[2]?.trim()
      if (assetType === '总数' || assetType === 'Total') {
        const total = parseNumber(row[6])
        if (total > 0) navTotal = total
      }
    }
    if (DEPOSIT_SECTIONS.has(row[0]) && row[1] === 'Data') {
      const key = row[2]?.trim()
      if (!key || key === '总数' || key === 'Total') continue
      const date = row[3]?.trim()
      const amount = parseNumber(row[5])
      if (date && /^\d{4}-\d{2}-\d{2}/.test(date) && amount !== 0) {
        cashFlows.push({ date: date.slice(0, 10), amount, description: row[4]?.trim() })
      }
    }
  }

  if (navFields.size === 0 && navTotal === 0 && cashFlows.length === 0) return null

  const startingCapital = navFields.get('开始价值') ?? navFields.get('Starting Value') ?? 0
  const currentCapital = navFields.get('结束价值') ?? navFields.get('Ending Value') ?? navTotal

  const netFlow = navFields.get('存款和取款') ?? navFields.get('Deposits & Withdrawals')
  const totalDeposits =
    netFlow != null && netFlow > 0
      ? netFlow
      : cashFlows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0)
  const totalWithdrawals =
    netFlow != null && netFlow < 0
      ? Math.abs(netFlow)
      : cashFlows.filter((f) => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0)

  return { startingCapital, currentCapital, totalDeposits, totalWithdrawals, cashFlows }
}

export function parseIbkrStatementText(text: string): ParseResult {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
  const rows = parsed.data.filter((row) => row.length >= 3)
  const account = extractAccount(rows)
  const orders = extractOrders(rows)
  const { trades, errors } = pairOrders(orders, account)
  const financials = extractFinancials(rows)

  if (orders.length === 0) {
    errors.push('未找到 IBKR 交易记录')
  }

  return { trades, account, financials, errors }
}

export function tradeFingerprint(trade: ParsedTrade): string {
  return [
    trade.account,
    trade.symbol,
    trade.side,
    trade.entryDate.slice(0, 19),
    trade.exitDate?.slice(0, 19) ?? '',
    trade.entryPrice.toFixed(4),
    trade.exitPrice?.toFixed(4) ?? '',
    trade.quantity,
    trade.pnl.toFixed(2),
  ].join('|')
}

export function mergeTrades(existing: ParsedTrade[], incoming: ParsedTrade[]) {
  const fingerprints = new Set(existing.map(tradeFingerprint))
  const toAdd: ParsedTrade[] = []
  let skipped = 0
  for (const trade of incoming) {
    const fp = tradeFingerprint(trade)
    if (fingerprints.has(fp)) {
      skipped += 1
      continue
    }
    fingerprints.add(fp)
    toAdd.push(trade)
  }
  return { merged: [...toAdd, ...existing], added: toAdd.length, skipped }
}
