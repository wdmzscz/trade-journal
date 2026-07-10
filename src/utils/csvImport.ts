import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'
import type { Trade } from '../types'
import { calculateTradePnl } from './stats'
import { isIbkrStatement, parseIbkrStatement, type IbkrAccountFinancials } from './ibkrImport'
import { isFidelityHistory, parseFidelityHistory } from './fidelityImport'

export type CsvFormat = 'generic' | 'ibkr' | 'fidelity'

export interface CsvParseResult {
  trades: Trade[]
  errors: string[]
  format: CsvFormat
  account?: string
  accountLabel?: string
  accounts?: Array<{ id: string; label: string; tradeCount: number }>
  accountLabels?: Record<string, string>
  accountFinancials?: IbkrAccountFinancials
  accountFinancialsMap?: Record<string, IbkrAccountFinancials>
}

export interface CsvRow {
  Symbol?: string
  symbol?: string
  Side?: string
  side?: string
  'Entry Date'?: string
  entryDate?: string
  'Exit Date'?: string
  exitDate?: string
  'Entry Price'?: string
  entryPrice?: string
  'Exit Price'?: string
  exitPrice?: string
  Quantity?: string
  quantity?: string
  Fees?: string
  fees?: string
  Setup?: string
  setup?: string
  Tags?: string
  tags?: string
  Notes?: string
  notes?: string
  Account?: string
  account?: string
  'R Multiple'?: string
  rMultiple?: string
}

function getField(row: CsvRow, ...keys: (keyof CsvRow)[]): string {
  for (const key of keys) {
    const val = row[key]
    if (val !== undefined && val !== '') return String(val).trim()
  }
  return ''
}

function parseSide(value: string): 'long' | 'short' {
  const v = value.toLowerCase()
  if (v === 'short' || v === 'sell' || v === 's') return 'short'
  return 'long'
}

function parseNumber(value: string, fallback = 0): number {
  const n = parseFloat(value.replace(/[$,]/g, ''))
  return isNaN(n) ? fallback : n
}

function parseDate(value: string): string {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export function parseTradeFromRow(row: CsvRow): Trade | null {
  const symbol = getField(row, 'Symbol', 'symbol')
  if (!symbol) return null

  const side = parseSide(getField(row, 'Side', 'side') || 'long')
  const entryPrice = parseNumber(getField(row, 'Entry Price', 'entryPrice'))
  const exitPriceStr = getField(row, 'Exit Price', 'exitPrice')
  const exitPrice = exitPriceStr ? parseNumber(exitPriceStr) : undefined
  const quantity = parseNumber(getField(row, 'Quantity', 'quantity'), 1)
  const fees = parseNumber(getField(row, 'Fees', 'fees'))
  const status: 'open' | 'closed' = exitPrice !== undefined ? 'closed' : 'open'

  let pnl = 0
  if (status === 'closed' && exitPrice !== undefined) {
    pnl = calculateTradePnl(side, entryPrice, exitPrice, quantity, fees)
  }

  const now = new Date().toISOString()
  const tagsStr = getField(row, 'Tags', 'tags')
  const rStr = getField(row, 'R Multiple', 'rMultiple')

  return {
    id: uuidv4(),
    symbol: symbol.toUpperCase(),
    side,
    status,
    entryDate: parseDate(getField(row, 'Entry Date', 'entryDate')),
    exitDate: exitPrice !== undefined ? parseDate(getField(row, 'Exit Date', 'exitDate')) : undefined,
    entryPrice,
    exitPrice,
    quantity,
    fees,
    pnl,
    rMultiple: rStr ? parseNumber(rStr) : undefined,
    setup: getField(row, 'Setup', 'setup') || undefined,
    tags: tagsStr ? tagsStr.split(/[,;]/).map((t) => t.trim()).filter(Boolean) : [],
    notes: getField(row, 'Notes', 'notes') || undefined,
    account: getField(row, 'Account', 'account') || 'Default',
    createdAt: now,
    updatedAt: now,
  }
}

export function parseCsvText(text: string): CsvParseResult {
  if (isIbkrStatement(text)) {
    const result = parseIbkrStatement(text)
    return {
      trades: result.trades,
      errors: result.errors,
      format: 'ibkr',
      account: result.account,
      accountLabel: result.accountLabel,
      accountFinancials: result.financials ?? undefined,
    }
  }

  if (isFidelityHistory(text)) {
    const result = parseFidelityHistory(text)
    return {
      trades: result.trades,
      errors: result.errors,
      format: 'fidelity',
      account: result.account,
      accountLabel: result.accountLabel,
      accounts: result.accounts,
      accountLabels: result.accountLabels,
      accountFinancials: result.accountFinancials,
      accountFinancialsMap: result.accountFinancialsMap,
    }
  }

  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
  })

  const trades: Trade[] = []
  const errors: string[] = []

  parsed.data.forEach((row, index) => {
    try {
      const trade = parseTradeFromRow(row)
      if (trade) {
        trades.push(trade)
      } else if (Object.values(row).some((v) => v)) {
        errors.push(`第 ${index + 2} 行：缺少 Symbol 字段`)
      }
    } catch (e) {
      errors.push(`第 ${index + 2} 行：${e instanceof Error ? e.message : '解析失败'}`)
    }
  })

  return { trades, errors, format: 'generic' }
}

export function parseCsvFile(file: File): Promise<CsvParseResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      resolve(parseCsvText(text))
    }
    reader.onerror = () => {
      resolve({ trades: [], errors: ['文件读取失败'], format: 'generic' })
    }
    reader.readAsText(file)
  })
}

export const CSV_TEMPLATE = `Symbol,Side,Entry Date,Exit Date,Entry Price,Exit Price,Quantity,Fees,Setup,Tags,Notes,Account,R Multiple
AAPL,long,2024-01-15,2024-01-15,185.50,188.20,100,2.00,Breakout,momentum;earnings,Clean breakout above resistance,Default,2.5
TSLA,short,2024-01-16,2024-01-16,245.00,240.50,50,1.50,Reversal,reversal,Failed rally at resistance,Default,1.8
NVDA,long,2024-01-17,,520.00,,25,1.00,Pullback,pullback,Still holding,Default,
`

export function downloadCsvTemplate(): void {
  const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'trade-journal-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

export function exportTradesToCsv(trades: Trade[]): void {
  const headers = ['Symbol', 'Side', 'Entry Date', 'Exit Date', 'Entry Price', 'Exit Price', 'Quantity', 'Fees', 'P&L', 'Setup', 'Tags', 'Notes', 'Account', 'R Multiple', 'Status']
  const rows = trades.map((t) => [
    t.symbol,
    t.side,
    t.entryDate.slice(0, 10),
    t.exitDate?.slice(0, 10) ?? '',
    t.entryPrice,
    t.exitPrice ?? '',
    t.quantity,
    t.fees,
    t.pnl,
    t.setup ?? '',
    t.tags.join(';'),
    t.notes ?? '',
    t.account,
    t.rMultiple ?? '',
    t.status,
  ])

  const csv = [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `trades-export-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}
