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
  PerformanceScore,
} from '../types'

export function formatCurrency(value: number): string {
  const sign = value >= 0 ? '' : '-'
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatQuantity(quantity: number): string {
  return String(parseFloat(quantity.toFixed(3)))
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

/** 期初净值（IBKR Change in NAV 的 Starting Value） */
export function resolveStartingCapital(
  startingCapital: number,
  totalDeposits?: number | null
): number {
  if (startingCapital > 0) return startingCapital
  if (totalDeposits != null && totalDeposits > 0) return totalDeposits
  return 0
}

/** 累计入金本金：优先 IBKR 存款合计，不用净资产 */
export function resolvePrincipalCapital(
  startingCapital: number,
  totalDeposits?: number | null
): number {
  if (totalDeposits != null && totalDeposits > 0) return totalDeposits
  if (startingCapital > 0) return startingCapital
  return 0
}

export function computeAccountReturn(
  startingCapital?: number | null,
  currentCapital?: number | null,
  totalDeposits?: number | null
): number | null {
  if (currentCapital == null || currentCapital <= 0) return null
  const basis = resolvePrincipalCapital(startingCapital ?? 0, totalDeposits)
  if (basis <= 0) return null
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

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, value))
}

function interpolateScore(
  value: number,
  points: Array<{ value: number; score: number }>
): number {
  if (value <= points[0].value) return points[0].score
  for (let i = 1; i < points.length; i += 1) {
    const lower = points[i - 1]
    const upper = points[i]
    if (value <= upper.value) {
      const progress = (value - lower.value) / (upper.value - lower.value)
      return lower.score + progress * (upper.score - lower.score)
    }
  }
  return points[points.length - 1].score
}

/** TradeZella 的 PF / Avg W:L 分段（<1.8 固定 20，2.6 达到 100） */
function zellaRatioScore(value: number): number {
  if (value < 1.8) return 20
  return clampScore(
    interpolateScore(value, [
      { value: 1.8, score: 50 },
      { value: 1.9, score: 60 },
      { value: 2.0, score: 70 },
      { value: 2.2, score: 80 },
      { value: 2.4, score: 90 },
      { value: 2.6, score: 100 },
    ])
  )
}

/** TradeZella Recovery Factor 官方分段的连续插值版本 */
function zellaRecoveryScore(value: number): number {
  if (value < 1) return 0
  return clampScore(
    interpolateScore(value, [
      { value: 1.0, score: 1 },
      { value: 1.5, score: 30 },
      { value: 2.0, score: 50 },
      { value: 2.5, score: 60 },
      { value: 3.0, score: 70 },
      { value: 3.5, score: 100 },
    ])
  )
}

/** 从累计盈亏曲线计算最大回撤（金额，正数） */
export function computeMaxDrawdown(cumulative: { cumulative: number }[]): number {
  let peak = 0
  let maxDd = 0
  for (const point of cumulative) {
    peak = Math.max(peak, point.cumulative)
    maxDd = Math.max(maxDd, peak - point.cumulative)
  }
  return maxDd
}

function computeMaxDrawdownPercent(cumulative: { cumulative: number }[]): number {
  let peak = 0
  let maxPercent = 0

  for (const point of cumulative) {
    if (point.cumulative > peak) peak = point.cumulative
    const drawdown = peak - point.cumulative
    if (drawdown <= 0) continue
    // 尚未形成正峰值就跌入亏损，视为 100% 回撤。
    const percent = peak > 0 ? (drawdown / peak) * 100 : 100
    maxPercent = Math.max(maxPercent, percent)
  }

  return maxPercent
}

/**
 * 六维交易综合评分（0–100），采用 TradeZella 公布的评分区间与权重：
 * PF 25% · Avg W/L 20% · Max DD 20% · Win% 15% · Recovery 10% · Consistency 10%
 * Win% · Profit factor · Avg win/loss · Recovery · Max DD control · Consistency
 */
export function computePerformanceScore(trades: Trade[]): PerformanceScore | null {
  const closed = trades.filter((t) => t.status === 'closed')
  if (closed.length < 3) return null

  const winners = closed.filter((t) => t.pnl > 0)
  const losers = closed.filter((t) => t.pnl < 0)
  const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0)
  const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0)
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0))

  const winRate = (winners.length / closed.length) * 100
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0
  const avgWin = winners.length ? grossProfit / winners.length : 0
  const avgLoss = losers.length ? grossLoss / losers.length : 0
  const avgWinLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 999 : 0

  const daily = computeDailyPnl(trades)
  const cumulative = computeCumulativePnl(daily)
  const maxDrawdown = computeMaxDrawdown(cumulative)
  const maxDrawdownPercent = computeMaxDrawdownPercent(cumulative)
  const recoveryFactor = maxDrawdown > 0 ? totalPnl / maxDrawdown : totalPnl > 0 ? 999 : 0

  const dailyMean = daily.length ? totalPnl / daily.length : 0
  const dailyVariance = daily.length
    ? daily.reduce((sum, day) => sum + (day.pnl - dailyMean) ** 2, 0) / daily.length
    : 0
  const dailyStdDev = Math.sqrt(dailyVariance)
  const consistencyVariation =
    totalPnl > 0 ? (dailyStdDev / totalPnl) * 100 : 100

  // TradeZella 官方映射
  const winScore = clampScore((winRate / 60) * 100) // 60% 封顶 100
  const pfScore = zellaRatioScore(profitFactor)
  const avgWlScore = zellaRatioScore(avgWinLossRatio)
  const recoveryScore = zellaRecoveryScore(recoveryFactor)
  const drawdownScore = clampScore(100 - maxDrawdownPercent)
  const consistencyScore =
    dailyMean < 0 ? 0 : clampScore(100 - consistencyVariation)

  const axes = [
    {
      key: 'win',
      label: 'Win %',
      score: Math.round(winScore * 10) / 10,
      rawLabel: `${winRate.toFixed(1)}%`,
    },
    {
      key: 'pf',
      label: 'Profit factor',
      score: Math.round(pfScore * 10) / 10,
      rawLabel: profitFactor >= 999 ? '∞' : profitFactor.toFixed(2),
    },
    {
      key: 'avgWl',
      label: 'Avg win/loss',
      score: Math.round(avgWlScore * 10) / 10,
      rawLabel: avgWinLossRatio >= 999 ? '∞' : `${avgWinLossRatio.toFixed(2)}x`,
    },
    {
      key: 'recovery',
      label: 'Recovery factor',
      score: Math.round(recoveryScore * 10) / 10,
      rawLabel: recoveryFactor >= 999 ? '∞' : recoveryFactor.toFixed(2),
    },
    {
      key: 'drawdown',
      label: 'Max drawdown',
      score: Math.round(drawdownScore * 10) / 10,
      rawLabel: `${maxDrawdownPercent.toFixed(1)}% (${formatCurrency(-maxDrawdown)})`,
    },
    {
      key: 'consistency',
      label: 'Consistency',
      score: Math.round(consistencyScore * 10) / 10,
      rawLabel: `波动 ${consistencyVariation.toFixed(1)}%`,
    },
  ]

  const weightedOverall =
    pfScore * 0.25 +
    avgWlScore * 0.2 +
    drawdownScore * 0.2 +
    winScore * 0.15 +
    recoveryScore * 0.1 +
    consistencyScore * 0.1
  const overall = Math.round(weightedOverall * 100) / 100

  return {
    overall,
    axes,
    closedTrades: closed.length,
    maxDrawdown,
    recoveryFactor: recoveryFactor >= 999 ? 999 : recoveryFactor,
    avgWinLossRatio: avgWinLossRatio >= 999 ? 999 : avgWinLossRatio,
    consistency: consistencyScore,
  }
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
