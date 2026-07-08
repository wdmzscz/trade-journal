import { v4 as uuidv4 } from 'uuid'
import Papa from 'papaparse'
import type { Trade, TradeSide } from '../types'

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
const ACCOUNT_FIELD_KEYS = new Set(['账户', 'Account'])

function normalizeAssetClass(value: string): Trade['assetClass'] {
  const v = value.toLowerCase()
  if (v.includes('期货') || v.includes('future')) return 'futures'
  if (v.includes('股票') || v.includes('stock') || v.includes('equity')) return 'stock'
  if (v.includes('期权') || v.includes('option')) return 'option'
  if (v.includes('外汇') || v.includes('forex')) return 'forex'
  return 'other'
}

function assetClassLabel(assetClass: Trade['assetClass']): string {
  switch (assetClass) {
    case 'futures':
      return '期货'
    case 'stock':
      return '股票'
    case 'option':
      return '期权'
    case 'forex':
      return '外汇'
    default:
      return '其他'
  }
}

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

export function isIbkrStatement(text: string): boolean {
  const head = text.slice(0, 2000)
  return (
    head.includes('Statement,Header') ||
    head.includes('交易,Header') ||
    head.includes('Trades,Header') ||
    head.includes('账户信息,Header') ||
    head.includes('Account Information,Header')
  )
}

function extractAccount(rows: string[][]): string {
  for (const row of rows) {
    if (!ACCOUNT_SECTIONS.has(row[0])) continue
    if (row[1] !== 'Data') continue
    if (!ACCOUNT_FIELD_KEYS.has(row[2])) continue
    const account = row[3]?.trim()
    if (account) return account
  }
  return 'IBKR'
}

function extractOrders(rows: string[][]): IbkrOrder[] {
  const orders: IbkrOrder[] = []

  for (const row of rows) {
    if (!TRADE_SECTIONS.has(row[0])) continue
    if (row[1] !== 'Data') continue
    if (row[2] !== 'Order') continue

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

function pairOrdersToTrades(orders: IbkrOrder[], account: string): { trades: Trade[]; errors: string[] } {
  const trades: Trade[] = []
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
      errors.push(`${order.symbol} 平仓单缺少对应开仓：${order.datetime}`)
      continue
    }

    const side: TradeSide = open.quantity > 0 ? 'long' : 'short'
    const quantity = Math.abs(open.quantity)
    const assetClass = normalizeAssetClass(open.assetClass)
    const now = new Date().toISOString()

    trades.push({
      id: uuidv4(),
      symbol: order.symbol,
      side,
      status: 'closed',
      assetClass,
      entryDate: parseIbkrDateTime(open.datetime),
      exitDate: parseIbkrDateTime(order.datetime),
      entryPrice: open.price,
      exitPrice: order.price,
      quantity,
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

  for (const [symbol, remaining] of openQueues) {
    if (remaining.length > 0) {
      errors.push(`${symbol} 有 ${remaining.length} 笔未平仓开仓记录（将标记为持仓中）`)
      for (const open of remaining) {
        const side: TradeSide = open.quantity > 0 ? 'long' : 'short'
        const assetClass = normalizeAssetClass(open.assetClass)
        const now = new Date().toISOString()
        trades.push({
          id: uuidv4(),
          symbol: open.symbol,
          side,
          status: 'open',
          assetClass,
          entryDate: parseIbkrDateTime(open.datetime),
          entryPrice: open.price,
          quantity: Math.abs(open.quantity),
          fees: Math.abs(open.commission),
          pnl: 0,
          setup: assetClassLabel(assetClass),
          tags: [assetClassLabel(assetClass), open.currency],
          notes: `IBKR ${open.symbol} (未平仓)`,
          account,
          createdAt: now,
          updatedAt: now,
        })
      }
    }
  }

  return { trades, errors }
}

export function parseIbkrStatement(text: string): {
  trades: Trade[]
  account: string
  errors: string[]
  format: 'ibkr'
} {
  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  })

  const rows = parsed.data.filter((row) => row.length >= 3)
  const account = extractAccount(rows)
  const orders = extractOrders(rows)
  const { trades, errors } = pairOrdersToTrades(orders, account)

  if (orders.length === 0) {
    errors.push('未在文件中找到 IBKR 交易记录（交易 / Trades 部分）')
  }

  return { trades, account, errors, format: 'ibkr' }
}

export function getIbkrSubtotals(text: string): Record<string, number> {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
  const subtotals: Record<string, number> = {}

  for (const row of parsed.data) {
    if (!TRADE_SECTIONS.has(row[0])) continue
    if (row[1] !== 'SubTotal') continue
    const symbol = row[5]?.trim()
    const realized = parseNumber(row[13])
    if (symbol) subtotals[symbol] = realized
  }

  return subtotals
}
