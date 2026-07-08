import type { Trade, DashboardStats, DailyPnl, SymbolStats, SetupStats } from '../types'

export function formatCurrency(value: number): string {
  const sign = value >= 0 ? '' : '-'
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
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
