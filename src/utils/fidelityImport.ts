import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'
import type { Trade, TradeSide } from '../types'
import { calculateTradePnl } from './stats'
import type { IbkrAccountFinancials } from './ibkrImport'

type FidelityOrderKind = 'open_long' | 'close_long' | 'open_short' | 'close_short'

interface FidelityOrder {
  symbol: string
  account: string
  accountLabel: string
  datetime: string
  price: number
  quantity: number
  commission: number
  fees: number
  kind: FidelityOrderKind
  seq: number
}

interface OpenLot extends FidelityOrder {
  remainingQty: number
}

interface FidelityRow {
  'Run Date'?: string
  Account?: string
  'Account Number'?: string
  Action?: string
  Symbol?: string
  'Price ($)'?: string
  Quantity?: string
  'Commission ($)'?: string
  'Fees ($)'?: string
  'Amount ($)'?: string
}

function parseNumber(value: string | undefined, fallback = 0): number {
  if (!value) return fallback
  const n = parseFloat(String(value).replace(/[$,"\s]/g, ''))
  return Number.isFinite(n) ? n : fallback
}

function parseFidelityDate(value: string): string {
  const trimmed = value.trim()
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return new Date().toISOString()
  const [, mm, dd, yyyy] = m
  return new Date(Date.UTC(+yyyy, +mm - 1, +dd, 12, 0, 0)).toISOString()
}

function classifyAction(action: string): FidelityOrderKind | 'skip' | 'deposit' | 'withdrawal' {
  const upper = action.toUpperCase()
  if (upper.includes('YOU BOUGHT SHORT COVER')) return 'close_short'
  if (upper.includes('YOU SOLD SHORT SALE')) return 'open_short'
  if (upper.includes('YOU BOUGHT')) return 'open_long'
  if (upper.includes('YOU SOLD')) return 'close_long'
  if (upper.includes('ELECTRONIC FUNDS TRANSFER')) {
    return 'deposit'
  }
  return 'skip'
}

function isDataRow(row: FidelityRow): boolean {
  const runDate = row['Run Date']?.trim()
  if (!runDate || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(runDate)) return false
  if (!row.Action?.trim()) return false
  if (row.Action.startsWith('"The data')) return false
  return true
}

export function isFidelityHistory(text: string): boolean {
  const sample = text.slice(0, 4000)
  return (
    sample.includes('Run Date') &&
    sample.includes('Account Number') &&
    sample.includes('Amount ($)') &&
    (sample.includes('YOU BOUGHT') || sample.includes('YOU SOLD')) &&
    !sample.includes('Statement,Header')
  )
}

function trimFidelityFooter(text: string): string {
  const marker = '"The data and information in this spreadsheet'
  const idx = text.indexOf(marker)
  return idx >= 0 ? text.slice(0, idx) : text
}

function pairOrdersToTrades(orders: FidelityOrder[]): { trades: Trade[]; errors: string[] } {
  const trades: Trade[] = []
  const errors: string[] = []
  const longQueues = new Map<string, OpenLot[]>()
  const shortQueues = new Map<string, OpenLot[]>()

  const queueKey = (order: FidelityOrder) => `${order.account}::${order.symbol}`

  for (const order of orders) {
    if (order.kind === 'open_long') {
      const key = queueKey(order)
      const queue = longQueues.get(key) ?? []
      queue.push({ ...order, remainingQty: order.quantity })
      longQueues.set(key, queue)
      continue
    }

    if (order.kind === 'open_short') {
      const key = queueKey(order)
      const queue = shortQueues.get(key) ?? []
      queue.push({ ...order, remainingQty: order.quantity })
      shortQueues.set(key, queue)
      continue
    }

    const isLongClose = order.kind === 'close_long'
    const key = queueKey(order)
    const queue = isLongClose ? longQueues.get(key) ?? [] : shortQueues.get(key) ?? []
    let closeQty = order.quantity
    const totalCloseQty = closeQty

    if (queue.length === 0) {
      errors.push(`${order.symbol} (${order.account}) 平仓缺少开仓：${order.datetime.slice(0, 10)}`)
      continue
    }

    while (closeQty > 0 && queue.length > 0) {
      const open = queue[0]
      const matchQty = Math.min(closeQty, open.remainingQty)
      const side: TradeSide = isLongClose ? 'long' : 'short'
      const openFeeShare = (open.commission + open.fees) * (matchQty / open.quantity)
      const closeFeeShare = (order.commission + order.fees) * (matchQty / totalCloseQty)
      const fees = openFeeShare + closeFeeShare
      const pnl = calculateTradePnl(side, open.price, order.price, matchQty, fees)
      const now = new Date().toISOString()

      trades.push({
        id: uuidv4(),
        symbol: order.symbol,
        side,
        status: 'closed',
        assetClass: 'stock',
        entryDate: open.datetime,
        exitDate: order.datetime,
        entryPrice: open.price,
        exitPrice: order.price,
        quantity: matchQty,
        fees,
        pnl,
        setup: '股票',
        tags: ['stock', 'fidelity'],
        notes: `Fidelity ${order.symbol}`,
        account: order.account,
        createdAt: now,
        updatedAt: now,
      })

      open.remainingQty -= matchQty
      closeQty -= matchQty
      if (open.remainingQty <= 0.000001) queue.shift()
    }

    if (closeQty > 0.000001) {
      errors.push(`${order.symbol} (${order.account}) 平仓数量超出开仓：${order.datetime.slice(0, 10)}`)
    }

    if (isLongClose) longQueues.set(key, queue)
    else shortQueues.set(key, queue)
  }

  for (const [key, remaining] of longQueues) {
    if (remaining.length === 0) continue
    const [account, symbol] = key.split('::')
    for (const open of remaining) {
      const now = new Date().toISOString()
      trades.push({
        id: uuidv4(),
        symbol,
        side: 'long',
        status: 'open',
        assetClass: 'stock',
        entryDate: open.datetime,
        entryPrice: open.price,
        quantity: open.remainingQty,
        fees: (open.commission + open.fees) * (open.remainingQty / open.quantity),
        pnl: 0,
        setup: '股票',
        tags: ['stock', 'fidelity'],
        notes: `Fidelity ${symbol} (未平仓)`,
        account,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  for (const [key, remaining] of shortQueues) {
    if (remaining.length === 0) continue
    const [account, symbol] = key.split('::')
    for (const open of remaining) {
      const now = new Date().toISOString()
      trades.push({
        id: uuidv4(),
        symbol,
        side: 'short',
        status: 'open',
        assetClass: 'stock',
        entryDate: open.datetime,
        entryPrice: open.price,
        quantity: open.remainingQty,
        fees: (open.commission + open.fees) * (open.remainingQty / open.quantity),
        pnl: 0,
        setup: '股票',
        tags: ['stock', 'fidelity'],
        notes: `Fidelity ${symbol} (未平仓)`,
        account,
        createdAt: now,
        updatedAt: now,
      })
    }
  }

  return { trades, errors }
}

export interface FidelityParseResult {
  trades: Trade[]
  errors: string[]
  format: 'fidelity'
  account: string
  accountLabel: string
  accounts: Array<{ id: string; label: string; tradeCount: number }>
  accountLabels: Record<string, string>
  accountFinancials?: IbkrAccountFinancials
  accountFinancialsMap: Record<string, IbkrAccountFinancials>
}

export function parseFidelityHistory(text: string): FidelityParseResult {
  const parsed = Papa.parse<FidelityRow>(trimFidelityFooter(text), {
    header: true,
    skipEmptyLines: true,
  })

  const orders: FidelityOrder[] = []
  const errors: string[] = []
  const cashFlowsByAccount = new Map<string, IbkrAccountFinancials['cashFlows']>()
  const depositsByAccount = new Map<string, number>()
  const withdrawalsByAccount = new Map<string, number>()
  const accountLabels = new Map<string, string>()
  let seq = 0

  for (const row of parsed.data) {
    if (!isDataRow(row)) continue

    const account = row['Account Number']?.trim() || 'Fidelity'
    const accountLabel = row.Account?.trim() || account
    accountLabels.set(account, accountLabel)

    const action = row.Action!.trim()
    const kind = classifyAction(action)

    if (kind === 'deposit' || kind === 'withdrawal') {
      const amount = parseNumber(row['Amount ($)'])
      const absAmount = Math.abs(amount)
      const flows = cashFlowsByAccount.get(account) ?? []
      flows.push({
        date: parseFidelityDate(row['Run Date']!),
        amount,
        description: action,
      })
      cashFlowsByAccount.set(account, flows)
      if (amount > 0) {
        depositsByAccount.set(account, (depositsByAccount.get(account) ?? 0) + amount)
      } else if (amount < 0) {
        withdrawalsByAccount.set(account, (withdrawalsByAccount.get(account) ?? 0) + absAmount)
      }
      continue
    }

    if (kind === 'skip') continue

    const symbol = row.Symbol?.trim().toUpperCase()
    if (!symbol) continue

    const qtyRaw = parseNumber(row.Quantity)
    const quantity = Math.abs(qtyRaw)
    if (quantity <= 0) continue

    const price = parseNumber(row['Price ($)'])
    if (price <= 0 && kind !== 'close_long' && kind !== 'close_short') continue

    orders.push({
      symbol,
      account,
      accountLabel,
      datetime: parseFidelityDate(row['Run Date']!),
      price,
      quantity,
      commission: Math.abs(parseNumber(row['Commission ($)'])),
      fees: Math.abs(parseNumber(row['Fees ($)'])),
      kind,
      seq: seq++,
    })
  }

  orders.sort((a, b) => {
    const byDate = a.datetime.localeCompare(b.datetime)
    if (byDate !== 0) return byDate
    return b.seq - a.seq
  })

  const { trades, errors: pairErrors } = pairOrdersToTrades(orders)
  errors.push(...pairErrors)

  const accountFinancialsMap: Record<string, IbkrAccountFinancials> = {}
  for (const [account, label] of accountLabels) {
    accountFinancialsMap[account] = {
      startingCapital: 0,
      currentCapital: 0,
      totalDeposits: depositsByAccount.get(account) ?? 0,
      totalWithdrawals: withdrawalsByAccount.get(account) ?? 0,
      cashFlows: cashFlowsByAccount.get(account) ?? [],
      navHistory: [],
    }
    void label
  }

  const accounts = [...accountLabels.entries()].map(([id, label]) => ({
    id,
    label,
    tradeCount: trades.filter((t) => t.account === id && t.status === 'closed').length,
  }))

  accounts.sort((a, b) => b.tradeCount - a.tradeCount)
  const primary = accounts[0]?.id ?? 'Fidelity'
  const primaryLabel = accountLabels.get(primary) ?? 'Fidelity'

  return {
    trades,
    errors,
    format: 'fidelity',
    account: primary,
    accountLabel: primaryLabel,
    accounts,
    accountLabels: Object.fromEntries(accountLabels),
    accountFinancials: accountFinancialsMap[primary],
    accountFinancialsMap,
  }
}
