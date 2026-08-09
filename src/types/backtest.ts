/** Backtesting / mock trading — fully isolated from live IBKR trades */

export interface BacktestSettings {
  startingBalance: number
  /** Risk per trade as % of account (used when stopLoss blank) */
  riskPercent: number
  /** RR Secured within [beMinR, beMaxR] counts as BE */
  beMinR: number
  beMaxR: number
  /** Optional flat cost deducted from each trade in R */
  costPerTradeR: number
}

export interface BacktestTrade {
  id: string
  /** When false, excluded from all stats & curves */
  includeInAnalysis: boolean
  symbol: string
  /** YYYY-MM-DD */
  date: string
  /** HH:mm optional */
  time?: string
  /** $ risk for this trade (Stop Loss column); if empty, use settings risk% */
  stopLoss?: number
  /** Realized R multiple (RR Secured) */
  rrSecured: number
  durationCandles?: number
  maxRr?: number
  chartContext?: string
  chartV?: string
  chartSMicro?: string
  chartEntry?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export type BacktestOutcome = 'win' | 'loss' | 'breakeven'

export const DEFAULT_BACKTEST_SETTINGS: BacktestSettings = {
  startingBalance: 50000,
  riskPercent: 1,
  beMinR: -0.01,
  beMaxR: 0.2,
  costPerTradeR: 0,
}

export function emptyBacktestTrade(): Omit<BacktestTrade, 'id' | 'createdAt' | 'updatedAt'> {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return {
    includeInAnalysis: true,
    symbol: '',
    date: `${y}-${m}-${d}`,
    time: '',
    stopLoss: undefined,
    rrSecured: 0,
    durationCandles: undefined,
    maxRr: undefined,
    chartContext: '',
    chartV: '',
    chartSMicro: '',
    chartEntry: '',
    notes: '',
  }
}
