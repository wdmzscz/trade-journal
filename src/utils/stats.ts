import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
} from 'date-fns'
import type {
  Trade,
  JournalEntry,
  DashboardStats,
  DailyPnl,
  AccountCashFlow,
  SymbolStats,
  SetupStats,
  DayResult,
  CalendarStats,
  CalendarWeekRow,
} from '../types'

export function formatCurrency(value: number): string {
  const sign = value >= 0 ? '' : '-'
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

/** 期初本金：来自 IBKR 期初净值；新账户期初为 0 时用累计入金 */
export function resolveStartingCapital(
  startingCapital: number,
  totalDeposits?: number | null
): number {
  if (startingCapital > 0) return startingCapital
  if (totalDeposits != null && totalDeposits > 0) return totalDeposits
  return 0
}

export function computeAccountReturn(
  startingCapital?: number | null,
  currentCapital?: number | null,
  totalDeposits?: number | null
): number | null {
  if (currentCapital == null || currentCapital <= 0) return null
  const basis =
    startingCapital != null && startingCapital > 0
      ? startingCapital
      : totalDeposits != null && totalDeposits > 0
        ? totalDeposits
        : null
  if (basis == null || basis <= 0) return null
  return currentCapital - basis
}

export function calculateTradePnl(
  side: 'long' | 'short',
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  fees = 0
): number {
  const gross = side === 'long'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity
  return gross - fees
}

export function computeDashboardStats(trades: Trade[]): DashboardStats {
  const closed = trades.filter((t) => t.status === 'closed')
  const winners = closed.filter((t) => t.pnl > 0)
  const losers = closed.filter((t) => t.pnl < 0)
  const breakEven = closed.filter((t) => t.pnl === 0)

  const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0)
  const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0))

  const avgWin = winners.length ? grossProfit / winners.length : 0
  const avgLoss = losers.length ? grossLoss / losers.length : 0
  const winRate = closed.length ? (winners.length / closed.length) * 100 : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const expectancy = closed.length ? totalPnl / closed.length : 0

  const rValues = closed.filter((t) => t.rMultiple !== undefined).map((t) => t.rMultiple!)
  const avgR = rValues.length ? rValues.reduce((a, b) => a + b, 0) / rValues.length : 0

  return {
    totalPnl,
    totalTrades: trades.length,
    closedTrades: closed.length,
    winRate,
    profitFactor: profitFactor === Infinity ? 999 : profitFactor,
    avgWin,
    avgLoss,
    largestWin: winners.length ? Math.max(...winners.map((t) => t.pnl)) : 0,
    largestLoss: losers.length ? Math.min(...losers.map((t) => t.pnl)) : 0,
    expectancy,
    avgR,
    winningTrades: winners.length,
    losingTrades: losers.length,
    breakEvenTrades: breakEven.length,
  }
}

export function computeDailyPnl(trades: Trade[]): DailyPnl[] {
  const map = new Map<string, { pnl: number; trades: number }>()

  for (const trade of trades.filter((t) => t.status === 'closed' && t.exitDate)) {
    const date = trade.exitDate!.slice(0, 10)
    const existing = map.get(date) ?? { pnl: 0, trades: 0 }
    map.set(date, { pnl: existing.pnl + trade.pnl, trades: existing.trades + 1 })
  }

  return Array.from(map.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export function computeCumulativePnl(daily: DailyPnl[]): { date: string; cumulative: number; daily: number }[] {
  let cumulative = 0
  return daily.map((d) => {
    cumulative += d.pnl
    return { date: d.date, cumulative, daily: d.pnl }
  })
}

function simulateDailyEquity(
  equityBase: number,
  cashFlows: AccountCashFlow[],
  dailyPnl: DailyPnl[]
): { result: Map<string, { pnlPercent: number; equityStart: number; equityEnd: number }>; finalEquity: number } {
  const pnlByDate = new Map(dailyPnl.map((d) => [d.date, d.pnl]))
  const flowsByDate = new Map<string, number>()
  for (const cf of cashFlows) {
    flowsByDate.set(cf.date, (flowsByDate.get(cf.date) ?? 0) + cf.amount)
  }

  const allDates = new Set<string>()
  cashFlows.forEach((cf) => allDates.add(cf.date))
  dailyPnl.forEach((d) => allDates.add(d.date))

  const sortedDates = [...allDates].sort()
  let equity = equityBase
  const result = new Map<string, { pnlPercent: number; equityStart: number; equityEnd: number }>()

  for (const date of sortedDates) {
    const flow = flowsByDate.get(date) ?? 0
    const equityAfterFlow = equity + flow
    const pnl = pnlByDate.get(date) ?? 0

    if (pnl !== 0 && equityAfterFlow > 0) {
      result.set(date, {
        pnlPercent: (pnl / equityAfterFlow) * 100,
        equityStart: equityAfterFlow,
        equityEnd: equityAfterFlow + pnl,
      })
    }

    equity = equityAfterFlow + pnl
  }

  return { result, finalEquity: equity }
}

function equityBeforeTradingDay(
  date: string,
  pnl: number,
  navHistory: { date: string; total: number }[]
): number {
  let priorNav = 0
  let sameDayNav = 0

  for (const row of navHistory) {
    if (row.date < date) priorNav = row.total
    if (row.date === date) sameDayNav = row.total
  }

  if (priorNav > 0) return priorNav
  if (sameDayNav > 0 && pnl !== 0) return sameDayNav - pnl
  return 0
}

/** 用 IBKR 每日净资产作为开盘前权益，计算每日收益率 */
export function computeDailyEquityFromNav(
  navHistory: { date: string; total: number }[],
  dailyPnl: DailyPnl[]
): Map<string, { pnlPercent: number; equityStart: number; equityEnd: number }> {
  const sortedNav = [...navHistory]
    .filter((row) => row.total > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
  const result = new Map<string, { pnlPercent: number; equityStart: number; equityEnd: number }>()

  for (const day of dailyPnl) {
    if (day.pnl === 0) continue
    const equityStart = equityBeforeTradingDay(day.date, day.pnl, sortedNav)
    if (equityStart <= 0) continue
    result.set(day.date, {
      pnlPercent: (day.pnl / equityStart) * 100,
      equityStart,
      equityEnd: equityStart + day.pnl,
    })
  }

  return result
}

/** 每日盈亏占当日开盘前权益的百分比（优先 IBKR 每日 NAV，其次入金时间线） */
export function computeDailyEquity(
  startingCapital: number,
  cashFlows: AccountCashFlow[],
  dailyPnl: DailyPnl[],
  navHistory?: { date: string; total: number }[]
): Map<string, { pnlPercent: number; equityStart: number; equityEnd: number }> {
  if (navHistory && navHistory.length > 0) {
    return computeDailyEquityFromNav(navHistory, dailyPnl)
  }

  const equityBase = startingCapital > 0 ? startingCapital : 0
  if (equityBase <= 0 && cashFlows.length === 0) return new Map()

  return simulateDailyEquity(equityBase, cashFlows, dailyPnl).result
}

export function computeSymbolStats(trades: Trade[]): SymbolStats[] {
  const map = new Map<string, { pnl: number; wins: number; total: number }>()

  for (const trade of trades.filter((t) => t.status === 'closed')) {
    const existing = map.get(trade.symbol) ?? { pnl: 0, wins: 0, total: 0 }
    map.set(trade.symbol, {
      pnl: existing.pnl + trade.pnl,
      wins: existing.wins + (trade.pnl > 0 ? 1 : 0),
      total: existing.total + 1,
    })
  }

  return Array.from(map.entries())
    .map(([symbol, data]) => ({
      symbol,
      pnl: data.pnl,
      trades: data.total,
      winRate: data.total ? (data.wins / data.total) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)
}

export function computeSetupStats(trades: Trade[]): SetupStats[] {
  const map = new Map<string, { pnl: number; wins: number; total: number }>()

  for (const trade of trades.filter((t) => t.status === 'closed' && t.setup)) {
    const setup = trade.setup!
    const existing = map.get(setup) ?? { pnl: 0, wins: 0, total: 0 }
    map.set(setup, {
      pnl: existing.pnl + trade.pnl,
      wins: existing.wins + (trade.pnl > 0 ? 1 : 0),
      total: existing.total + 1,
    })
  }

  return Array.from(map.entries())
    .map(([setup, data]) => ({
      setup,
      pnl: data.pnl,
      trades: data.total,
      winRate: data.total ? (data.wins / data.total) * 100 : 0,
    }))
    .sort((a, b) => b.pnl - a.pnl)
}

export function computeWinLossDistribution(trades: Trade[]): { name: string; value: number; color: string }[] {
  const stats = computeDashboardStats(trades)
  return [
    { name: '盈利', value: stats.winningTrades, color: '#22c55e' },
    { name: '亏损', value: stats.losingTrades, color: '#ef4444' },
    { name: '持平', value: stats.breakEvenTrades, color: '#94a3b8' },
  ].filter((d) => d.value > 0)
}

export function computeDayOfWeekStats(trades: Trade[]): { day: string; pnl: number; trades: number }[] {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const map = new Map<number, { pnl: number; trades: number }>()

  for (const trade of trades.filter((t) => t.status === 'closed' && t.exitDate)) {
    const day = new Date(trade.exitDate!).getDay()
    const existing = map.get(day) ?? { pnl: 0, trades: 0 }
    map.set(day, { pnl: existing.pnl + trade.pnl, trades: existing.trades + 1 })
  }

  return [1, 2, 3, 4, 5].map((day) => ({
    day: days[day],
    pnl: map.get(day)?.pnl ?? 0,
    trades: map.get(day)?.trades ?? 0,
  }))
}

export function getDayResult(pnl: number | undefined): DayResult {
  if (pnl === undefined) return 'none'
  if (pnl > 0) return 'win'
  if (pnl < 0) return 'loss'
  return 'breakeven'
}

export function dayResultColor(result: DayResult): string {
  switch (result) {
    case 'win':
      return '#22c55e'
    case 'loss':
      return '#ef4444'
    case 'breakeven':
      return '#94a3b8'
    default:
      return 'transparent'
  }
}

export function dayResultBgClass(result: DayResult, selected = false): string {
  if (selected) return 'bg-brand-600 text-white'
  switch (result) {
    case 'win':
      return 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
    case 'loss':
      return 'bg-red-50 text-red-600 hover:bg-red-100'
    case 'breakeven':
      return 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    default:
      return 'hover:bg-slate-50 text-slate-700'
  }
}

function maxConsecutive<T>(items: T[], predicate: (item: T) => boolean): number {
  let max = 0
  let current = 0
  for (const item of items) {
    if (predicate(item)) {
      current += 1
      max = Math.max(max, current)
    } else {
      current = 0
    }
  }
  return max
}

export function filterTradesByDateRange(trades: Trade[], dateFrom: string, dateTo: string): Trade[] {
  return trades.filter((trade) => {
    if (trade.status !== 'closed' || !trade.exitDate) return false
    const date = trade.exitDate.slice(0, 10)
    return date >= dateFrom && date <= dateTo
  })
}

export function filterDailyPnlByRange(daily: DailyPnl[], dateFrom: string, dateTo: string): DailyPnl[] {
  return daily.filter((d) => d.date >= dateFrom && d.date <= dateTo)
}

export function computeCalendarStats(
  trades: Trade[],
  journal: JournalEntry[],
  dailyPnl: DailyPnl[],
  dateFrom: string,
  dateTo: string
): CalendarStats {
  const closed = filterTradesByDateRange(trades, dateFrom, dateTo)
  const winners = closed.filter((t) => t.pnl > 0)
  const losers = closed.filter((t) => t.pnl < 0)
  const breakEven = closed.filter((t) => t.pnl === 0)
  const openTrades = trades.filter((t) => t.status === 'open').length

  const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0)
  const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0))
  const totalFees = closed.reduce((sum, t) => sum + t.fees, 0)

  const periodDaily = filterDailyPnlByRange(dailyPnl, dateFrom, dateTo)
  const winningDays = periodDaily.filter((d) => d.pnl > 0)
  const losingDays = periodDaily.filter((d) => d.pnl < 0)
  const breakevenDays = periodDaily.filter((d) => d.pnl === 0)
  const loggedDays = journal.filter((j) => j.date >= dateFrom && j.date <= dateTo).length

  return {
    totalPnl,
    totalTrades: closed.length,
    winningTrades: winners.length,
    losingTrades: losers.length,
    breakEvenTrades: breakEven.length,
    winRate: closed.length ? (winners.length / closed.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0,
    avgWin: winners.length ? grossProfit / winners.length : 0,
    avgLoss: losers.length ? grossLoss / losers.length : 0,
    avgTradePnl: closed.length ? totalPnl / closed.length : 0,
    largestWin: winners.length ? Math.max(...winners.map((t) => t.pnl)) : 0,
    largestLoss: losers.length ? Math.min(...losers.map((t) => t.pnl)) : 0,
    totalTradingDays: periodDaily.length,
    winningDays: winningDays.length,
    losingDays: losingDays.length,
    breakevenDays: breakevenDays.length,
    loggedDays,
    maxConsecutiveWins: maxConsecutive(closed, (t) => t.pnl > 0),
    maxConsecutiveLosses: maxConsecutive(closed, (t) => t.pnl < 0),
    maxConsecutiveWinningDays: maxConsecutive(periodDaily, (d) => d.pnl > 0),
    maxConsecutiveLosingDays: maxConsecutive(periodDaily, (d) => d.pnl < 0),
    avgDailyPnl: periodDaily.length ? totalPnl / periodDaily.length : 0,
    avgWinningDayPnl: winningDays.length ? winningDays.reduce((s, d) => s + d.pnl, 0) / winningDays.length : 0,
    avgLosingDayPnl: losingDays.length ? losingDays.reduce((s, d) => s + d.pnl, 0) / losingDays.length : 0,
    largestProfitableDay: winningDays.length ? Math.max(...winningDays.map((d) => d.pnl)) : 0,
    largestLosingDay: losingDays.length ? Math.min(...losingDays.map((d) => d.pnl)) : 0,
    totalFees,
    openTrades,
    expectancy: closed.length ? totalPnl / closed.length : 0,
  }
}

export function buildMonthWeeks(month: Date, pnlMap: Map<string, DailyPnl>): CalendarWeekRow[] {
  const monthStart = startOfMonth(month)
  const monthEnd = endOfMonth(month)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const weeks: CalendarWeekRow[] = []
  let cursor = gridStart

  while (cursor <= gridEnd) {
    const days: (string | null)[] = []
    let weekPnl = 0
    let weekTrades = 0

    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i)
      if (isSameMonth(day, month)) {
        const dateStr = format(day, 'yyyy-MM-dd')
        days.push(dateStr)
        const entry = pnlMap.get(dateStr)
        if (entry) {
          weekPnl += entry.pnl
          weekTrades += entry.trades
        }
      } else {
        days.push(null)
      }
    }

    weeks.push({ days, weekPnl, weekTrades })
    cursor = addDays(cursor, 7)
  }

  return weeks
}

export function buildMiniMonthDays(month: Date): string[] {
  return eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }).map((d) =>
    format(d, 'yyyy-MM-dd')
  )
}

export function filterTrades(trades: Trade[], filters: {
  search?: string
  symbol?: string
  side?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  account?: string
}): Trade[] {
  return trades.filter((trade) => {
    if (filters.search) {
      const q = filters.search.toLowerCase()
      const haystack = [trade.symbol, trade.setup, trade.notes, ...trade.tags].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (filters.symbol && filters.symbol !== 'all' && trade.symbol !== filters.symbol) return false
    if (filters.side && filters.side !== 'all' && trade.side !== filters.side) return false
    if (filters.status && filters.status !== 'all' && trade.status !== filters.status) return false
    if (filters.account && filters.account !== 'all' && trade.account !== filters.account) return false
    if (filters.dateFrom && trade.entryDate.slice(0, 10) < filters.dateFrom) return false
    if (filters.dateTo && trade.entryDate.slice(0, 10) > filters.dateTo) return false
    return true
  })
}
