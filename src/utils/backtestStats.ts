import type {
  BacktestOutcome,
  BacktestSettings,
  BacktestTrade,
} from '../types/backtest'

export function classifyBacktestOutcome(
  rrSecured: number,
  settings: BacktestSettings
): BacktestOutcome {
  const net = rrSecured - (settings.costPerTradeR || 0)
  if (net >= settings.beMinR && net <= settings.beMaxR) return 'breakeven'
  return net > settings.beMaxR ? 'win' : 'loss'
}

function sortTrades(trades: BacktestTrade[]): BacktestTrade[] {
  return [...trades].sort((a, b) => {
    const da = `${a.date}T${a.time || '00:00'}`
    const db = `${b.date}T${b.time || '00:00'}`
    const cmp = da.localeCompare(db)
    if (cmp !== 0) return cmp
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function includedBacktestTrades(trades: BacktestTrade[]): BacktestTrade[] {
  return sortTrades(trades.filter((t) => t.includeInAnalysis && t.symbol.trim()))
}

function riskDollars(
  trade: BacktestTrade,
  settings: BacktestSettings,
  balanceForPct: number
): number {
  if (trade.stopLoss != null && trade.stopLoss > 0) return trade.stopLoss
  return balanceForPct * (settings.riskPercent / 100)
}

export type BacktestEquityPoint = {
  index: number
  tradeId: string
  date: string
  symbol: string
  rrSecured: number
  outcome: BacktestOutcome
  cumulativeR: number
  compoundedBalance: number
  uncompoundedBalance: number
  compoundedPnl: number
  uncompoundedPnl: number
}

export function computeBacktestEquity(
  trades: BacktestTrade[],
  settings: BacktestSettings
): BacktestEquityPoint[] {
  const list = includedBacktestTrades(trades)
  const points: BacktestEquityPoint[] = []
  let cumulativeR = 0
  let compounded = settings.startingBalance
  let uncompounded = settings.startingBalance
  const fixedRisk = settings.startingBalance * (settings.riskPercent / 100)

  list.forEach((trade, index) => {
    const netR = trade.rrSecured - (settings.costPerTradeR || 0)
    const outcome = classifyBacktestOutcome(trade.rrSecured, settings)
    cumulativeR += netR

    const cRisk = riskDollars(trade, settings, compounded)
    const uRisk =
      trade.stopLoss != null && trade.stopLoss > 0 ? trade.stopLoss : fixedRisk
    const compoundedPnl = netR * cRisk
    const uncompoundedPnl = netR * uRisk
    compounded += compoundedPnl
    uncompounded += uncompoundedPnl

    points.push({
      index: index + 1,
      tradeId: trade.id,
      date: trade.date,
      symbol: trade.symbol,
      rrSecured: netR,
      outcome,
      cumulativeR,
      compoundedBalance: compounded,
      uncompoundedBalance: uncompounded,
      compoundedPnl,
      uncompoundedPnl,
    })
  })

  return points
}

export type BacktestOverview = {
  totalTrades: number
  wins: number
  losses: number
  breakevens: number
  winRate: number
  beRate: number
  lossRate: number
  totalR: number
  avgWinR: number
  avgLossR: number
  avgTradeR: number
  expectancyR: number
  profitFactor: number
  maxRrReached: number
  startingBalance: number
  compoundedBalance: number
  uncompoundedBalance: number
  compoundedRoi: number
  uncompoundedRoi: number
  maxDrawdownR: number
  maxDrawdownPctCompounded: number
  avgDaysBetweenTrades: number | null
}

function maxDrawdownFromSeries(values: number[]): number {
  let peak = values[0] ?? 0
  let maxDd = 0
  for (const v of values) {
    peak = Math.max(peak, v)
    maxDd = Math.min(maxDd, v - peak)
  }
  return maxDd
}

function maxDrawdownPct(balances: number[]): number {
  let peak = balances[0] ?? 0
  let maxPct = 0
  for (const b of balances) {
    if (b > peak) peak = b
    if (peak > 0) {
      const dd = ((b - peak) / peak) * 100
      maxPct = Math.min(maxPct, dd)
    }
  }
  return maxPct
}

export function computeBacktestOverview(
  trades: BacktestTrade[],
  settings: BacktestSettings
): BacktestOverview {
  const equity = computeBacktestEquity(trades, settings)
  const list = includedBacktestTrades(trades)
  const outcomes = list.map((t) => classifyBacktestOutcome(t.rrSecured, settings))
  const wins = outcomes.filter((o) => o === 'win').length
  const losses = outcomes.filter((o) => o === 'loss').length
  const breakevens = outcomes.filter((o) => o === 'breakeven').length
  const decisive = wins + losses
  const total = list.length

  const winRs = list
    .filter((_, i) => outcomes[i] === 'win')
    .map((t) => t.rrSecured - (settings.costPerTradeR || 0))
  const lossRs = list
    .filter((_, i) => outcomes[i] === 'loss')
    .map((t) => t.rrSecured - (settings.costPerTradeR || 0))

  const totalR = equity.length ? equity[equity.length - 1].cumulativeR : 0
  const grossWinR = winRs.reduce((s, r) => s + r, 0)
  const grossLossR = Math.abs(lossRs.reduce((s, r) => s + r, 0))
  const avgWinR = winRs.length ? grossWinR / winRs.length : 0
  const avgLossR = lossRs.length ? grossLossR / lossRs.length : 0

  const compoundedBalance = equity.length
    ? equity[equity.length - 1].compoundedBalance
    : settings.startingBalance
  const uncompoundedBalance = equity.length
    ? equity[equity.length - 1].uncompoundedBalance
    : settings.startingBalance

  const rSeries = equity.map((p) => p.cumulativeR)
  const balSeries = [
    settings.startingBalance,
    ...equity.map((p) => p.compoundedBalance),
  ]

  let avgDaysBetweenTrades: number | null = null
  if (list.length >= 2) {
    const dates = list.map((t) => new Date(`${t.date}T12:00:00`).getTime())
    let sum = 0
    for (let i = 1; i < dates.length; i++) sum += (dates[i] - dates[i - 1]) / 86400000
    avgDaysBetweenTrades = sum / (dates.length - 1)
  }

  const maxRrReached = list.reduce((m, t) => Math.max(m, t.maxRr ?? t.rrSecured), 0)

  return {
    totalTrades: total,
    wins,
    losses,
    breakevens,
    winRate: decisive ? (wins / decisive) * 100 : 0,
    beRate: total ? (breakevens / total) * 100 : 0,
    lossRate: total ? (losses / total) * 100 : 0,
    totalR,
    avgWinR,
    avgLossR,
    avgTradeR: total ? totalR / total : 0,
    expectancyR: total ? totalR / total : 0,
    profitFactor: grossLossR > 0 ? grossWinR / grossLossR : grossWinR > 0 ? 999 : 0,
    maxRrReached,
    startingBalance: settings.startingBalance,
    compoundedBalance,
    uncompoundedBalance,
    compoundedRoi:
      settings.startingBalance > 0
        ? ((compoundedBalance - settings.startingBalance) / settings.startingBalance) * 100
        : 0,
    uncompoundedRoi:
      settings.startingBalance > 0
        ? ((uncompoundedBalance - settings.startingBalance) / settings.startingBalance) * 100
        : 0,
    maxDrawdownR: maxDrawdownFromSeries(rSeries),
    maxDrawdownPctCompounded: maxDrawdownPct(balSeries),
    avgDaysBetweenTrades,
  }
}

export type BacktestBucket = { label: string; r: number; trades: number }

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function computeRByDayOfWeek(
  trades: BacktestTrade[],
  settings: BacktestSettings
): BacktestBucket[] {
  const map = new Map<number, { r: number; trades: number }>()
  for (const t of includedBacktestTrades(trades)) {
    const day = new Date(`${t.date}T12:00:00`).getDay()
    const net = t.rrSecured - (settings.costPerTradeR || 0)
    const cur = map.get(day) ?? { r: 0, trades: 0 }
    map.set(day, { r: cur.r + net, trades: cur.trades + 1 })
  }
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    label: WEEKDAYS[d],
    r: map.get(d)?.r ?? 0,
    trades: map.get(d)?.trades ?? 0,
  }))
}

export function computeRByMonth(
  trades: BacktestTrade[],
  settings: BacktestSettings
): BacktestBucket[] {
  const map = new Map<number, { r: number; trades: number }>()
  for (const t of includedBacktestTrades(trades)) {
    const month = Number(t.date.slice(5, 7)) - 1
    const net = t.rrSecured - (settings.costPerTradeR || 0)
    const cur = map.get(month) ?? { r: 0, trades: 0 }
    map.set(month, { r: cur.r + net, trades: cur.trades + 1 })
  }
  return Array.from({ length: 12 }, (_, m) => ({
    label: `${m + 1}月`,
    r: map.get(m)?.r ?? 0,
    trades: map.get(m)?.trades ?? 0,
  }))
}

export function computeRByHour(
  trades: BacktestTrade[],
  settings: BacktestSettings
): { hour: number; r: number; trades: number }[] {
  const map = new Map<number, { r: number; trades: number }>()
  for (const t of includedBacktestTrades(trades)) {
    if (!t.time) continue
    const hour = Number(t.time.slice(0, 2))
    if (Number.isNaN(hour)) continue
    const net = t.rrSecured - (settings.costPerTradeR || 0)
    const cur = map.get(hour) ?? { r: 0, trades: 0 }
    map.set(hour, { r: cur.r + net, trades: cur.trades + 1 })
  }
  return Array.from(map.entries())
    .map(([hour, data]) => ({ hour, ...data }))
    .sort((a, b) => a.hour - b.hour)
}

export function formatR(value: number, digits = 2): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(digits)}R`
}
