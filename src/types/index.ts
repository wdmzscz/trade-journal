export type TradeSide = 'long' | 'short'
export type TradeStatus = 'open' | 'closed'

export interface Trade {
  id: string
  symbol: string
  side: TradeSide
  status: TradeStatus
  entryDate: string
  exitDate?: string
  entryPrice: number
  exitPrice?: number
  quantity: number
  fees: number
  pnl: number
  rMultiple?: number
  setup?: string
  tags: string[]
  notes?: string
  account: string
  createdAt: string
  updatedAt: string
}

export interface JournalEntry {
  id: string
  date: string
  mood?: string
  marketCondition?: string
  preMarketPlan?: string
  postMarketReview?: string
  lessons?: string
  goals?: string
  rating?: number
  createdAt: string
  updatedAt: string
}

export interface TradeFilters {
  search: string
  symbol: string
  side: TradeSide | 'all'
  status: TradeStatus | 'all'
  dateFrom: string
  dateTo: string
  account: string
}

export interface DashboardStats {
  totalPnl: number
  totalTrades: number
  closedTrades: number
  winRate: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  largestWin: number
  largestLoss: number
  expectancy: number
  avgR: number
  winningTrades: number
  losingTrades: number
  breakEvenTrades: number
}

export interface DailyPnl {
  date: string
  pnl: number
  trades: number
}

export interface SymbolStats {
  symbol: string
  pnl: number
  trades: number
  winRate: number
}

export interface SetupStats {
  setup: string
  pnl: number
  trades: number
  winRate: number
}

export type DayResult = 'win' | 'loss' | 'breakeven' | 'none'

export interface CalendarStats {
  totalPnl: number
  totalTrades: number
  winningTrades: number
  losingTrades: number
  breakEvenTrades: number
  winRate: number
  profitFactor: number
  avgWin: number
  avgLoss: number
  avgTradePnl: number
  largestWin: number
  largestLoss: number
  totalTradingDays: number
  winningDays: number
  losingDays: number
  breakevenDays: number
  loggedDays: number
  maxConsecutiveWins: number
  maxConsecutiveLosses: number
  maxConsecutiveWinningDays: number
  maxConsecutiveLosingDays: number
  avgDailyPnl: number
  avgWinningDayPnl: number
  avgLosingDayPnl: number
  largestProfitableDay: number
  largestLosingDay: number
  totalFees: number
  openTrades: number
  expectancy: number
}

export interface CalendarWeekRow {
  days: (string | null)[]
  weekPnl: number
  weekTrades: number
}
