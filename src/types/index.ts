export type TradeSide = 'long' | 'short'
export type TradeStatus = 'open' | 'closed'

export type AssetClass = 'futures' | 'stock' | 'option' | 'forex' | 'other'

export type AccountType = 'futures' | 'stock' | 'other'

export interface AccountCashFlow {
  date: string
  amount: number
  description?: string
}

export interface DailyNav {
  date: string
  total: number
}

export interface AccountProfile {
  id: string
  label: string
  type: AccountType
  createdAt: string
  /** 期初净值（IBKR：开始价值） */
  startingCapital?: number
  /** 当前/期末净值（IBKR：结束价值） */
  currentCapital?: number
  /** 累计入金（IBKR 存款和取款合计） */
  totalDeposits?: number
  totalWithdrawals?: number
  cashFlows?: AccountCashFlow[]
  /** IBKR 每日净资产（NAV in Base） */
  navHistory?: DailyNav[]
}

export interface AccountInfo {
  id: string
  label: string
  type: AccountType
  tradeCount: number
  totalPnl: number
  startingCapital?: number
  currentCapital?: number
  totalDeposits?: number
}

export interface Trade {
  id: string
  symbol: string
  side: TradeSide
  status: TradeStatus
  assetClass?: AssetClass
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
  account: string
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
