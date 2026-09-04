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

export interface PaperAccountSettings {
  /** 每笔风险占账户 % */
  riskPercent: number
  /** BE 下限（R） */
  beMinR: number
  /** BE 上限（R） */
  beMaxR: number
  /** 每笔成本（R） */
  costPerTradeR: number
}

export const DEFAULT_PAPER_SETTINGS: PaperAccountSettings = {
  riskPercent: 1,
  beMinR: -0.01,
  beMaxR: 0.2,
  costPerTradeR: 0,
}

export function resolvePaperSettings(
  settings?: Partial<PaperAccountSettings> | null
): PaperAccountSettings {
  return { ...DEFAULT_PAPER_SETTINGS, ...(settings ?? {}) }
}

export interface AccountProfile {
  id: string
  label: string
  type: AccountType
  createdAt: string
  /** Paper / 模拟账户：简化记账，不并入「全部账户」实盘汇总 */
  isPaper?: boolean
  /** Paper 分析参数（余额用 startingCapital / totalDeposits） */
  paperSettings?: PaperAccountSettings
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
  isPaper?: boolean
  tradeCount: number
  /** 账户展示盈亏。Paper = 案例/交易合计；实盘 = 券商净资产 − 入金（没有净资产时才回退交易合计）。 */
  totalPnl: number
  /** Paper 本金，或实盘累计入金。 */
  principalCapital: number
  startingCapital?: number
  currentCapital?: number
  totalDeposits?: number
}

/** 当前选中范围（单个账户或全部实盘）的展示数字，UI 只读不重算 */
export interface AccountScope {
  id: string
  label: string
  isAll: boolean
  isPaper: boolean
  tradeCount: number
  totalPnl: number
  principalCapital: number
  startingCapital?: number
  currentCapital?: number
  totalDeposits?: number
}

export interface ChartLink {
  timeframe: string
  url: string
  note?: string
}

/** Playbook 三周期：E Entry · V Validation · C Context（周期不固定，仅作槽位） */
export const PLAYBOOK_TIMEFRAMES = ['E', 'V', 'C'] as const

export const PLAYBOOK_SLOT_LABELS: Record<(typeof PLAYBOOK_TIMEFRAMES)[number], string> = {
  E: 'Entry',
  V: 'Validation',
  C: 'Context',
}

export function emptyPlaybookCharts(): ChartLink[] {
  return PLAYBOOK_TIMEFRAMES.map((timeframe) => ({ timeframe, url: '' }))
}

/** |盈亏| ≤ 此阈值视为 BE（手续费/滑点导致止损难正好为 0） */
export const BREAKEVEN_PNL_THRESHOLD = 10

/** 案例结果：盈利复盘 / 亏损复盘 */
export type PlaybookOutcome = 'win' | 'loss' | 'breakeven'

export function playbookOutcomeFromPnl(pnl?: number | null): PlaybookOutcome | undefined {
  if (pnl == null || Number.isNaN(Number(pnl))) return undefined
  if (Math.abs(pnl) <= BREAKEVEN_PNL_THRESHOLD) return 'breakeven'
  return pnl > 0 ? 'win' : 'loss'
}

export function resolvePlaybookOutcome(entry: Pick<PlaybookEntry, 'outcome' | 'pnl'>): PlaybookOutcome | undefined {
  return entry.outcome ?? playbookOutcomeFromPnl(entry.pnl)
}

export interface PlaybookEntry {
  id: string
  tradeId?: string
  symbol: string
  side: TradeSide
  account: string
  entryDate: string
  exitDate?: string
  entryPrice: number
  exitPrice?: number
  pnl?: number
  /** 盈利 / 亏损案例；旧数据可从 pnl 推断 */
  outcome?: PlaybookOutcome
  setup?: string
  title: string
  thesis?: string
  lessons?: string
  journalDate?: string
  charts: ChartLink[]
  tags: string[]
  /** 置顶收藏，始终排在时间排序之前 */
  pinned?: boolean
  createdAt: string
  updatedAt: string
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
  /** Paper：本单最高曾达到的 R */
  maxRr?: number
  /** Paper：止损金额（$ risk / stop loss） */
  stopLoss?: number
  setup?: string
  tags: string[]
  notes?: string
  /** TradingView 入场图链接（轻量，不占本地存储空间） */
  entryCharts?: ChartLink[]
  playbookId?: string
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

/** 六维交易评分（类似 Zella Score） */
export interface PerformanceScoreAxis {
  key: string
  label: string
  score: number
  rawLabel: string
}

export interface PerformanceScore {
  overall: number
  axes: PerformanceScoreAxis[]
  closedTrades: number
  maxDrawdown: number
  recoveryFactor: number
  avgWinLossRatio: number
  consistency: number
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
