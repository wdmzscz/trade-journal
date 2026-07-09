import { v4 as uuidv4 } from 'uuid'
import Papa from 'papaparse'
import type { Trade, TradeSide, AccountCashFlow } from '../types'

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
const NAV_CHANGE_SECTIONS = new Set(['净资产值变更', 'Change in NAV'])
const NAV_VALUE_SECTIONS = new Set(['净资产值', 'Net Asset Value'])
const DEPOSIT_SECTIONS = new Set(['存款和取款', 'Deposits & Withdrawals', 'Deposits and Withdrawals'])
const STARTING_VALUE_KEYS = new Set(['开始价值', 'Starting Value'])
const ENDING_VALUE_KEYS = new Set(['结束价值', 'Ending Value'])
const TOTAL_ROW_KEYS = new Set(['总数', 'Total', '总计（全部资产）', 'Total (All Assets)'])

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

function toLocalIso(y: number, mo: number, d: number, h: number, mi: number, s: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}.000`
}

function parseIbkrDateTime(value: string): string {
  const cleaned = value.replace(/"/g, '').trim()
  const semi = cleaned.match(/^(\d{4})(\d{2})(\d{2});(\d{2})(\d{2})(\d{2})$/)
  if (semi) {
    const [, y, mo, d, h, mi, s] = semi
    return toLocalIso(+y, +mo, +d, +h, +mi, +s)
  }
  const comma = cleaned.match(/^(\d{4})-(\d{2})-(\d{2}),?\s*(\d{2}):(\d{2}):(\d{2})/)
  if (comma) {
    const [, y, mo, d, h, mi, s] = comma
    return toLocalIso(+y, +mo, +d, +h, +mi, +s)
  }
  const dt = new Date(cleaned)
  if (!Number.isNaN(dt.getTime())) {
    return toLocalIso(
      dt.getFullYear(),
      dt.getMonth() + 1,
      dt.getDate(),
      dt.getHours(),
      dt.getMinutes(),
      dt.getSeconds()
    )
  }
  const now = new Date()
  return toLocalIso(now.getFullYear(), now.getMonth() + 1, now.getDate(), 0, 0, 0)
}

function isFlexQueryCsv(text: string): boolean {
  if (text.includes('Statement,Header') || text.includes('交易,Header') || text.includes('Trades,Header')) {
    return false
  }
  return text.includes('"ClientAccountID"') && text.includes('"Open/CloseIndicator"')
}

function extractFlexSection(text: string, marker: string): string {
  const lines = text.split(/\r?\n/)
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(marker) && lines[i].startsWith('"ClientAccountID"')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return ''

  const sectionLines = [lines[headerIdx]]
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (line.startsWith('"ClientAccountID"') && !line.includes(marker)) break
    sectionLines.push(line)
  }
  return sectionLines.join('\n')
}

function extractFlexAccountInfo(text: string): { account: string; label: string } {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (
      !line.startsWith('"ClientAccountID"') ||
      !line.includes('"Name"') ||
      line.includes('"Open/CloseIndicator"')
    ) {
      continue
    }
    const parsed = Papa.parse<Record<string, string>>(lines.slice(i, i + 2).join('\n'), {
      header: true,
      skipEmptyLines: true,
    })
    const row = parsed.data[0]
    if (!row) break
    const account = row['ClientAccountID']?.trim()
    if (!account) break
    const alias = row['AccountAlias']?.trim()
    return { account, label: alias || 'IBKR' }
  }
  return { account: 'IBKR', label: 'IBKR' }
}

function extractFlexOrders(text: string): { orders: IbkrOrder[]; account: string } {
  const section = extractFlexSection(text, '"Open/CloseIndicator"')
  if (!section) return { orders: [], account: 'IBKR' }

  const parsed = Papa.parse<Record<string, string>>(section, { header: true, skipEmptyLines: true })
  let account = 'IBKR'
  const orders: IbkrOrder[] = []

  for (const row of parsed.data) {
    if (row['LevelOfDetail'] !== 'ORDER') continue
    const code = row['Open/CloseIndicator']?.trim() as 'O' | 'C' | undefined
    if (code !== 'O' && code !== 'C') continue
    const symbol = row['Symbol']?.trim()
    if (!symbol) continue

    if (account === 'IBKR' && row['ClientAccountID']?.trim()) {
      account = row['ClientAccountID'].trim()
    }

    orders.push({
      symbol,
      assetClass: row['AssetClass']?.trim() ?? '',
      currency: row['CurrencyPrimary']?.trim() ?? 'USD',
      datetime: row['DateTime']?.trim() || row['TradeDate']?.trim() || '',
      quantity: parseNumber(row['Quantity']),
      price: parseNumber(row['TradePrice']),
      commission: parseNumber(row['IBCommission']),
      realizedPnl: parseNumber(row['FifoPnlRealized']),
      code,
    })
  }

  orders.sort((a, b) => parseIbkrDateTime(a.datetime).localeCompare(parseIbkrDateTime(b.datetime)))
  return { orders, account }
}

export interface IbkrAccountFinancials {
  startingCapital: number
  currentCapital: number
  totalDeposits: number
  totalWithdrawals: number
  cashFlows: AccountCashFlow[]
  navHistory: { date: string; total: number }[]
}

function formatFlexReportDate(value: string): string {
  const cleaned = value.replace(/"/g, '').trim()
  if (/^\d{8}$/.test(cleaned)) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`
  }
  return cleaned.slice(0, 10)
}

function sumPositiveCashFlows(cashFlows: AccountCashFlow[]): number {
  return cashFlows.filter((flow) => flow.amount > 0).reduce((sum, flow) => sum + flow.amount, 0)
}

function extractFlexDailyNav(text: string): IbkrAccountFinancials['navHistory'] {
  const lines = text.split(/\r?\n/)
  let headerIdx = -1
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (
      line.startsWith('"ClientAccountID"') &&
      line.includes('"ReportDate"') &&
      line.includes('"Total"') &&
      line.includes('"Cash"')
    ) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return []

  const sectionLines = [lines[headerIdx]]
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (line.startsWith('"ClientAccountID"')) break
    sectionLines.push(line)
  }

  const parsed = Papa.parse<Record<string, string>>(sectionLines.join('\n'), {
    header: true,
    skipEmptyLines: true,
  })

  return parsed.data
    .map((row) => ({
      date: formatFlexReportDate(row['ReportDate'] ?? ''),
      total: parseNumber(row['Total']),
    }))
    .filter((row) => row.date && row.total > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

function formatFlexCashDate(value: string): string {
  const cleaned = value.replace(/"/g, '').trim()
  const semi = cleaned.match(/^(\d{4})(\d{2})(\d{2})/)
  if (semi) return `${semi[1]}-${semi[2]}-${semi[3]}`
  return cleaned.slice(0, 10)
}

function isPrincipalCashFlow(type: string, description: string): boolean {
  const haystack = `${type} ${description}`.toLowerCase()
  if (
    /dividend|interest|commission|fee|withholding|tax|coupon|accrual/.test(haystack)
  ) {
    return false
  }
  return /deposit|withdraw|transfer|电子资金|存款|取款|入金|出金/.test(haystack)
}

function extractFlexDeposits(text: string): AccountCashFlow[] {
  const lines = text.split(/\r?\n/)
  const cashFlows: AccountCashFlow[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.startsWith('"ClientAccountID"')) continue
    if (!line.includes('"Amount"')) continue
    if (
      line.includes('"Open/CloseIndicator"') ||
      line.includes('"ReportDate"') ||
      line.includes('"StartingValue"') ||
      line.includes('"Starting Value"')
    ) {
      continue
    }

    const isCashTransactions =
      line.includes('"Date/Time"') || line.includes('"DateTime"')
    const hasSettleDate =
      line.includes('"SettleDate"') ||
      line.includes('"Settle Date"') ||
      line.includes('"Date"')
    if (!isCashTransactions && !hasSettleDate) continue

    const sectionLines = [line]
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (!next.trim()) continue
      if (next.startsWith('"ClientAccountID"')) break
      sectionLines.push(next)
    }

    const parsed = Papa.parse<Record<string, string>>(sectionLines.join('\n'), {
      header: true,
      skipEmptyLines: true,
    })

    for (const row of parsed.data) {
      const date = formatFlexCashDate(
        row['SettleDate'] ??
          row['Settle Date'] ??
          row['Date/Time'] ??
          row['DateTime'] ??
          row['Date'] ??
          ''
      )
      const amount = parseNumber(row['Amount'])
      const description = row['Description']?.trim()
      const type = row['Type']?.trim() ?? ''
      if (!date || amount === 0) continue
      if (description && /total/i.test(description)) continue
      if (isCashTransactions && !isPrincipalCashFlow(type, description ?? '')) continue
      cashFlows.push({ date, amount, description: description || type || undefined })
    }
  }

  return cashFlows
}

function extractFlexChangeInNavSummary(text: string): Omit<IbkrAccountFinancials, 'cashFlows' | 'navHistory'> | null {
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (
      !line.startsWith('"ClientAccountID"') ||
      !(line.includes('"StartingValue"') || line.includes('"Starting Value"')) ||
      !(line.includes('"EndingValue"') || line.includes('"Ending Value"'))
    ) {
      continue
    }

    const sectionLines = [lines[i]]
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j]
      if (!next.trim()) continue
      if (next.startsWith('"ClientAccountID"')) break
      sectionLines.push(next)
    }

    const parsed = Papa.parse<Record<string, string>>(sectionLines.join('\n'), {
      header: true,
      skipEmptyLines: true,
    })

    for (const row of parsed.data) {
      const starting = parseNumber(row['StartingValue'] ?? row['Starting Value'])
      const ending = parseNumber(row['EndingValue'] ?? row['Ending Value'])
      if (starting <= 0 && ending <= 0) continue

      const deposits = parseNumber(
        row['DepositsWithdrawals'] ??
          row['Deposits & Withdrawals'] ??
          row['DepositsAndWithdrawals'] ??
          row['Deposits/Withdrawals']
      )
      const totalDeposits = deposits > 0 ? deposits : 0

      return {
        startingCapital: starting,
        currentCapital: ending,
        totalDeposits,
        totalWithdrawals: deposits < 0 ? Math.abs(deposits) : 0,
      }
    }
  }
  return null
}

function mergeFlexFinancials(text: string): IbkrAccountFinancials | null {
  const navHistory = extractFlexDailyNav(text)
  const cashFlows = extractFlexDeposits(text)
  const changeInNav = extractFlexChangeInNavSummary(text)

  if (navHistory.length === 0 && cashFlows.length === 0 && !changeInNav) return null

  const flowDeposits = sumPositiveCashFlows(cashFlows)
  const totalDeposits = Math.max(flowDeposits, changeInNav?.totalDeposits ?? 0)
  const totalWithdrawals = Math.max(
    cashFlows.filter((flow) => flow.amount < 0).reduce((sum, flow) => sum + Math.abs(flow.amount), 0),
    changeInNav?.totalWithdrawals ?? 0
  )

  const currentCapital =
    navHistory.length > 0
      ? navHistory[navHistory.length - 1].total
      : (changeInNav?.currentCapital ?? 0)

  return {
    startingCapital: changeInNav?.startingCapital ?? 0,
    currentCapital,
    totalDeposits,
    totalWithdrawals,
    cashFlows,
    navHistory,
  }
}

function extractFlexFinancials(text: string): IbkrAccountFinancials | null {
  return mergeFlexFinancials(text)
}

function parseFlexQueryStatement(text: string): {
  trades: Trade[]
  account: string
  accountLabel: string
  errors: string[]
  financials: IbkrAccountFinancials | null
} {
  const accountInfo = extractFlexAccountInfo(text)
  const { orders, account: accountFromTrades } = extractFlexOrders(text)
  const account = accountFromTrades !== 'IBKR' ? accountFromTrades : accountInfo.account
  const { trades, errors } = pairOrdersToTrades(orders, account)
  const financials = extractFlexFinancials(text)

  if (orders.length === 0) {
    errors.push('未找到 IBKR 交易记录（Flex Query Trades 段）')
  }

  return { trades, account, accountLabel: accountInfo.label, errors, financials }
}

export function isIbkrStatement(text: string): boolean {
  if (isFlexQueryCsv(text)) return true
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
  accountLabel: string
  errors: string[]
  format: 'ibkr'
  financials: IbkrAccountFinancials | null
} {
  if (isFlexQueryCsv(text)) {
    const result = parseFlexQueryStatement(text)
    return { ...result, format: 'ibkr' }
  }

  const parsed = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
  })

  const rows = parsed.data.filter((row) => row.length >= 3)
  const account = extractAccount(rows)
  const orders = extractOrders(rows)
  const { trades, errors } = pairOrdersToTrades(orders, account)
  const financials = extractFinancials(rows)

  if (orders.length === 0) {
    errors.push('未在文件中找到 IBKR 交易记录（交易 / Trades 部分）')
  }

  return { trades, account, accountLabel: 'IBKR', errors, format: 'ibkr', financials }
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

function extractFinancials(rows: string[][]): IbkrAccountFinancials | null {
  const navFields = new Map<string, number>()
  let navTotal = 0
  const cashFlows: AccountCashFlow[] = []

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
      const currencyOrTotal = row[2]?.trim()
      if (!currencyOrTotal || TOTAL_ROW_KEYS.has(currencyOrTotal)) continue

      const date = row[3]?.trim()
      const amount = parseNumber(row[5])
      if (date && /^\d{4}-\d{2}-\d{2}/.test(date) && amount !== 0) {
        cashFlows.push({
          date: date.slice(0, 10),
          amount,
          description: row[4]?.trim(),
        })
      }
    }
  }

  if (navFields.size === 0 && navTotal === 0 && cashFlows.length === 0) {
    return null
  }

  let startingCapital = 0
  for (const key of STARTING_VALUE_KEYS) {
    if (navFields.has(key)) {
      startingCapital = navFields.get(key)!
      break
    }
  }

  let currentCapital = navTotal
  for (const key of ENDING_VALUE_KEYS) {
    if (navFields.has(key)) {
      currentCapital = navFields.get(key)!
      break
    }
  }

  const totalDeposits = (() => {
    const netFlow = navFields.get('存款和取款') ?? navFields.get('Deposits & Withdrawals')
    if (netFlow != null && netFlow > 0) return netFlow
    return cashFlows.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0)
  })()
  const totalWithdrawals = (() => {
    const netFlow = navFields.get('存款和取款') ?? navFields.get('Deposits & Withdrawals')
    if (netFlow != null && netFlow < 0) return Math.abs(netFlow)
    return cashFlows.filter((f) => f.amount < 0).reduce((s, f) => s + Math.abs(f.amount), 0)
  })()

  return {
    startingCapital,
    currentCapital,
    totalDeposits,
    totalWithdrawals,
    cashFlows,
    navHistory: [],
  }
}
