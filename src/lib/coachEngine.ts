import type { JournalEntry, PaperAccountSettings, PlaybookEntry, Trade } from '../types'
import { resolvePlaybookOutcome } from '../types'
import { countValidCharts } from '../utils/chartLinks'
import {
  classifyTradeOutcomeWithOptions,
  computeDashboardStats,
  formatCurrency,
  formatPercent,
  type TradeOutcome,
} from '../utils/stats'
import type { DashboardStats } from '../types'

const MIN_OVERVIEW_SAMPLE = 10
const MIN_GROUP_SAMPLE = 3

export type CoachInsightKind =
  | 'overview'
  | 'edge'
  | 'avoid'
  | 'loss'
  | 'expectancy'
  | 'playbook'
  | 'sample'
  | 'strategy'
  | 'success'

export type CoachInsight = {
  id: string
  kind: CoachInsightKind
  title: string
  body: string
  href?: string
}

export type GroupStat = {
  key: string
  label: string
  trades: number
  wins: number
  losses: number
  pnl: number
  winRate: number
  expectancy: number
}

export type CoachPreset = {
  id: string
  label: string
  query: string
}

export const COACH_PRESETS: CoachPreset[] = [
  { id: 'today', label: '今日小结', query: '今日小结' },
  { id: 'success-learn', label: '成功案例学到什么', query: '成功案例学到什么' },
  { id: 'loss-improve', label: '失败案例怎么总结', query: '失败案例怎么总结' },
  { id: 'strategy-gap', label: '失败和策略差在哪', query: '失败和策略差在哪' },
  { id: 'best-entry', label: '哪个入场最好', query: '哪个入场最好' },
  { id: 'expectancy', label: '期望值为什么是这个数', query: '期望值为什么是这个数' },
  { id: 'winrate-vs-rr', label: '该提高胜率还是盈亏比', query: '该提高胜率还是盈亏比' },
]

export type TodayTradeLine = {
  id: string
  symbol: string
  side: Trade['side']
  setup?: string
  status: Trade['status']
  pnl: number
  outcome?: TradeOutcome
  hasPlaybook: boolean
  hasNotes: boolean
}

export type TodayPlaybookSuggestion = {
  tradeId: string
  symbol: string
  reason: string
}

export type TodaySummary = {
  date: string
  headline: string
  body: string
  closedCount: number
  openCount: number
  olderOpenCount: number
  pnl: number
  wins: number
  losses: number
  breakEvens: number
  trades: TodayTradeLine[]
  playbookSuggestions: TodayPlaybookSuggestion[]
  journalWritten: boolean
  empty: boolean
}

export type CoachReport = {
  stats: DashboardStats
  insights: CoachInsight[]
  setups: GroupStat[]
  symbols: GroupStat[]
  sides: GroupStat[]
  bestSetup?: GroupStat
  worstSetup?: GroupStat
  bestSymbol?: GroupStat
  worstSymbol?: GroupStat
  bestSide?: GroupStat
  lossPlaybooks: PlaybookEntry[]
  winPlaybooks: PlaybookEntry[]
  biggestLosses: Trade[]
  strategy: string
  successSummary: string
  failureSummary: string
  today: TodaySummary
}

const STRATEGY_STORAGE_KEY = 'trade-journal-coach-strategy'

export function loadCoachStrategy(accountId: string): string {
  try {
    const raw = localStorage.getItem(STRATEGY_STORAGE_KEY)
    if (!raw) return ''
    const map = JSON.parse(raw) as Record<string, string>
    return map[accountId] ?? ''
  } catch {
    return ''
  }
}

export function saveCoachStrategy(accountId: string, text: string): void {
  let map: Record<string, string> = {}
  try {
    const raw = localStorage.getItem(STRATEGY_STORAGE_KEY)
    if (raw) map = JSON.parse(raw) as Record<string, string>
  } catch {
    map = {}
  }
  map[accountId] = text
  localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(map))
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'then', 'have', 'will',
  '只是', '然后', '因为', '如果', '就是', '一个', '这个', '那个', '没有', '可以',
  '需要', '时候', '自己', '我们', '他们', '或者', '以及', '还有', '不是', '一定',
])

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
}

function topCounts(items: string[], limit = 3): Array<[string, number]> {
  const map = new Map<string, number>()
  for (const item of items) {
    const key = item.trim()
    if (!key) continue
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
}

function uniqueSnippets(texts: Array<string | undefined>, limit = 4): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of texts) {
    const text = raw?.trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text.length > 80 ? `${text.slice(0, 80)}…` : text)
    if (out.length >= limit) break
  }
  return out
}

function overlapTokens(a: string[], b: Set<string>): string[] {
  return [...new Set(a.filter((token) => b.has(token)))]
}

function groupTrades(
  closed: Trade[],
  paper: PaperAccountSettings | null | undefined,
  keyOf: (trade: Trade) => string | undefined,
  labelOf: (key: string) => string
): GroupStat[] {
  const map = new Map<string, { wins: number; losses: number; pnl: number; total: number }>()

  for (const trade of closed) {
    const key = keyOf(trade)?.trim()
    if (!key) continue
    const existing = map.get(key) ?? { wins: 0, losses: 0, pnl: 0, total: 0 }
    const outcome = classifyTradeOutcomeWithOptions(trade, paper)
    map.set(key, {
      wins: existing.wins + (outcome === 'win' ? 1 : 0),
      losses: existing.losses + (outcome === 'loss' ? 1 : 0),
      pnl: existing.pnl + trade.pnl,
      total: existing.total + 1,
    })
  }

  return Array.from(map.entries())
    .map(([key, data]) => {
      const decisive = data.wins + data.losses
      return {
        key,
        label: labelOf(key),
        trades: data.total,
        wins: data.wins,
        losses: data.losses,
        pnl: data.pnl,
        winRate: decisive ? (data.wins / decisive) * 100 : 0,
        expectancy: data.total ? data.pnl / data.total : 0,
      }
    })
    .sort((a, b) => b.expectancy - a.expectancy || b.pnl - a.pnl)
}

function pickBest(groups: GroupStat[]): GroupStat | undefined {
  return groups.find((g) => g.trades >= MIN_GROUP_SAMPLE && g.expectancy > 0)
    ?? groups.find((g) => g.trades >= MIN_GROUP_SAMPLE)
}

function pickWorst(groups: GroupStat[]): GroupStat | undefined {
  const ranked = [...groups].sort((a, b) => a.expectancy - b.expectancy || a.pnl - b.pnl)
  return ranked.find((g) => g.trades >= MIN_GROUP_SAMPLE && g.expectancy < 0)
    ?? ranked.find((g) => g.trades >= MIN_GROUP_SAMPLE)
}

function formatGroup(group: GroupStat): string {
  return `${group.label}（${group.trades} 笔，胜率 ${formatPercent(group.winRate)}，期望 ${formatCurrency(group.expectancy)}，合计 ${formatCurrency(group.pnl)}）`
}

function payoffAdvice(stats: DashboardStats): { focus: 'winRate' | 'payoff' | 'balanced'; text: string } {
  const ratio = stats.avgLoss > 0 ? stats.avgWin / stats.avgLoss : stats.avgWin > 0 ? 99 : 0
  const winRate = stats.winRate
  if (stats.closedTrades === 0) {
    return { focus: 'balanced', text: '还没有已平仓交易，先记几笔再看该提高哪一项。' }
  }
  if (winRate >= 55 && stats.expectancy < 0) {
    return {
      focus: 'payoff',
      text: `胜率 ${formatPercent(winRate)} 已经不低，但期望值仍是 ${formatCurrency(stats.expectancy)}。平均盈利 ${formatCurrency(stats.avgWin)}，平均亏损 ${formatCurrency(stats.avgLoss)}，盈亏比约 ${ratio.toFixed(2)}。优先收紧亏损、让盈利单多跑一段，而不是再堆胜率。`,
    }
  }
  if (winRate < 45 && stats.expectancy >= 0) {
    return {
      focus: 'winRate',
      text: `胜率只有 ${formatPercent(winRate)}，但期望值是 ${formatCurrency(stats.expectancy)}，说明单笔赚得够。可以继续接受较低胜率，同时筛掉最差的 setup / 品种来抬高入场质量。`,
    }
  }
  if (stats.expectancy < 0 && ratio < 1.5) {
    return {
      focus: 'payoff',
      text: `期望值 ${formatCurrency(stats.expectancy)} 为负，盈亏比约 ${ratio.toFixed(2)}。先把平均亏损压到平均盈利以下，或提高每笔目标 R。`,
    }
  }
  if (winRate < 50 && stats.expectancy < 0) {
    return {
      focus: 'winRate',
      text: `胜率 ${formatPercent(winRate)}、期望 ${formatCurrency(stats.expectancy)} 都偏弱。先少做最差 setup，只保留数据更好的入场。`,
    }
  }
  return {
    focus: 'balanced',
    text: `胜率 ${formatPercent(winRate)}，盈亏比约 ${ratio.toFixed(2)}，期望 ${formatCurrency(stats.expectancy)}。保持现有结构，把仓位集中到期望更高的 setup。`,
  }
}

function hasEntryChart(entry: PlaybookEntry): boolean {
  return entry.charts.some((chart) => chart.timeframe === 'E' && chart.url.trim())
    || countValidCharts(entry.charts) > 0
}

export function localDateKey(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function tradeTouchesDate(trade: Trade, date: string): boolean {
  return trade.entryDate.slice(0, 10) === date || trade.exitDate?.slice(0, 10) === date
}

function tradeHasPlaybook(trade: Trade, playbook: PlaybookEntry[]): boolean {
  return Boolean(trade.playbookId) || playbook.some((entry) => entry.tradeId === trade.id)
}

function journalHasReview(entry: JournalEntry | undefined): boolean {
  if (!entry) return false
  return Boolean(
    entry.postMarketReview?.trim()
    || entry.lessons?.trim()
    || entry.preMarketPlan?.trim()
  )
}

export function buildTodaySummary(
  trades: Trade[],
  playbook: PlaybookEntry[],
  journal: JournalEntry[] = [],
  paper?: PaperAccountSettings | null,
  strategyText = '',
  date = localDateKey()
): TodaySummary {
  const dayTrades = trades
    .filter((trade) => tradeTouchesDate(trade, date))
    .sort((a, b) => b.entryDate.localeCompare(a.entryDate) || b.updatedAt.localeCompare(a.updatedAt))

  const closedToday = dayTrades.filter((trade) => trade.status === 'closed' && trade.exitDate?.slice(0, 10) === date)
  const openToday = dayTrades.filter((trade) => trade.status === 'open')
  const olderOpenCount = trades.filter(
    (trade) => trade.status === 'open' && trade.entryDate.slice(0, 10) !== date
  ).length

  const wins = closedToday.filter((trade) => classifyTradeOutcomeWithOptions(trade, paper) === 'win')
  const losses = closedToday.filter((trade) => classifyTradeOutcomeWithOptions(trade, paper) === 'loss')
  const breakEvens = closedToday.filter((trade) => classifyTradeOutcomeWithOptions(trade, paper) === 'breakeven')
  const pnl = closedToday.reduce((sum, trade) => sum + trade.pnl, 0)

  const lines: TodayTradeLine[] = dayTrades.map((trade) => ({
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    setup: trade.setup,
    status: trade.status,
    pnl: trade.pnl,
    outcome: trade.status === 'closed' ? classifyTradeOutcomeWithOptions(trade, paper) : undefined,
    hasPlaybook: tradeHasPlaybook(trade, playbook),
    hasNotes: Boolean(trade.notes?.trim()),
  }))

  const closedWithoutPlaybook = closedToday
    .filter((trade) => !tradeHasPlaybook(trade, playbook))
    .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))

  const biggestLoss = [...losses].sort((a, b) => a.pnl - b.pnl)[0]
  const biggestWin = [...wins].sort((a, b) => b.pnl - a.pnl)[0]
  const playbookSuggestions: TodayPlaybookSuggestion[] = closedWithoutPlaybook.slice(0, 3).map((trade) => {
    const outcome = classifyTradeOutcomeWithOptions(trade, paper)
    let reason = '已平仓还没写进 Playbook。'
    if (biggestLoss && trade.id === biggestLoss.id) {
      reason = '今天最大亏损，写进 Playbook 方便对照策略。'
    } else if (biggestWin && trade.id === biggestWin.id) {
      reason = '今天最大盈利，记下当时为什么进，下次当模板。'
    } else if (outcome === 'loss') {
      reason = '亏损单建议补 lessons，避免同样的错再犯。'
    } else if (outcome === 'win') {
      reason = '盈利单建议记 thesis，教练才能学你赢的做法。'
    }
    return { tradeId: trade.id, symbol: trade.symbol, reason }
  })

  const strategy = strategyText.trim()
  const strategyTokens = tokenize(strategy)
  const strategySet = new Set(strategyTokens)
  const dayText = [
    ...dayTrades.map((trade) => trade.setup ?? ''),
    ...dayTrades.map((trade) => trade.notes ?? ''),
  ].join(' ')
  const aligned = overlapTokens(tokenize(dayText), strategySet)

  const closedAll = trades.filter((trade) => trade.status === 'closed')
  const winSetups = topCounts(
    closedAll
      .filter((trade) => classifyTradeOutcomeWithOptions(trade, paper) === 'win')
      .map((trade) => trade.setup ?? '')
  )
  const lossSetups = topCounts(
    closedAll
      .filter((trade) => classifyTradeOutcomeWithOptions(trade, paper) === 'loss')
      .map((trade) => trade.setup ?? '')
  )
  const winSetupNames = new Set(winSetups.map(([name]) => name))
  const todaySetups = [...new Set(dayTrades.map((trade) => trade.setup?.trim()).filter(Boolean) as string[])]
  const offPlanToday = todaySetups.filter((name) => name && !winSetupNames.has(name) && lossSetups.some(([loss]) => loss === name))

  const journalEntry = journal.find((entry) => entry.date === date)
  const journalWritten = journalHasReview(journalEntry)

  const parts: string[] = []
  const empty = dayTrades.length === 0

  if (empty) {
    parts.push('今天还没有开仓或平仓记录。记完当天的单再打开这里，小结会跟着更新。')
    if (olderOpenCount > 0) {
      parts.push(`另外还有 ${olderOpenCount} 笔更早开的仓还没平，不计入今日盈亏。`)
    }
  } else {
    if (closedToday.length > 0) {
      parts.push(
        `今日平仓 ${closedToday.length} 笔：${wins.length}W / ${breakEvens.length}BE / ${losses.length}L，合计 ${formatCurrency(pnl)}。`
      )
    } else {
      parts.push('今天有进出场，但还没有今日平仓，盈亏要等平了才算进小结。')
    }
    if (openToday.length > 0) {
      parts.push(
        `还有 ${openToday.length} 笔今天相关的仓位未平：${openToday.map((trade) => trade.symbol).join('、')}。`
      )
    }
    const labels = dayTrades.map((trade) => {
      const setup = trade.setup ? ` / ${trade.setup}` : ''
      const side = trade.side === 'short' ? '空' : '多'
      if (trade.status === 'open') return `${trade.symbol}${setup} ${side}（未平）`
      return `${trade.symbol}${setup} ${side} ${formatCurrency(trade.pnl)}`
    })
    parts.push(`明细：${labels.join('；')}。`)
  }

  if (!strategy) {
    parts.push('还没写下策略，没法判断今天有没有偏离计划。')
  } else if (empty) {
    parts.push('有交易后再对照你写下的策略。')
  } else if (aligned.length) {
    parts.push(`今天的 setup / 备注对上了策略词：${aligned.slice(0, 8).join('、')}。`)
  } else if (dayText.trim()) {
    parts.push('今天的 setup / 备注对不上策略里的关键词，可能是临场加戏，也可能只是没写清「符合哪一条」。')
  } else {
    parts.push('今天没填 setup 也没写备注，没法判断有没有按计划做。')
  }

  if (offPlanToday.length) {
    parts.push(`今天做了历史上更常亏、很少出现在盈利单里的入场：${offPlanToday.join('、')}。`)
  }

  if (playbookSuggestions.length) {
    parts.push(
      `建议写入 Playbook：${playbookSuggestions.map((item) => `${item.symbol}（${item.reason}）`).join(' ')}`
    )
  } else if (closedToday.length > 0) {
    parts.push('今天平仓都已经进过 Playbook。')
  }

  if (!journalWritten) {
    parts.push(empty
      ? '如果今天看过盘，也可以先去日记写几句计划或复盘。'
      : '今日日记还没写复盘 / lessons，记完交易后补几句更有用。')
  } else {
    parts.push('今日日记已经有内容。')
  }

  let headline = '今日还没有交易'
  if (!empty && closedToday.length === 0) {
    headline = `今日有 ${dayTrades.length} 笔进出，尚未计入盈亏`
  } else if (closedToday.length > 0) {
    headline = pnl >= 0
      ? `今日小结：平仓 ${closedToday.length} 笔，${formatCurrency(pnl)}`
      : `今日小结：平仓 ${closedToday.length} 笔，亏了 ${formatCurrency(Math.abs(pnl))}`
  }

  return {
    date,
    headline,
    body: parts.join(' '),
    closedCount: closedToday.length,
    openCount: openToday.length,
    olderOpenCount,
    pnl,
    wins: wins.length,
    losses: losses.length,
    breakEvens: breakEvens.length,
    trades: lines,
    playbookSuggestions,
    journalWritten,
    empty,
  }
}

export function buildCoachReport(
  trades: Trade[],
  playbook: PlaybookEntry[],
  paper?: PaperAccountSettings | null,
  strategyText = '',
  journal: JournalEntry[] = [],
  date = localDateKey()
): CoachReport {
  const stats = computeDashboardStats(trades, paper)
  const closed = trades.filter((t) => t.status === 'closed')
  const setups = groupTrades(closed, paper, (t) => t.setup, (key) => key)
  const symbols = groupTrades(closed, paper, (t) => t.symbol, (key) => key)
  const sides = groupTrades(
    closed,
    paper,
    (t) => t.side,
    (key) => (key === 'short' ? '空头' : '多头')
  )

  const bestSetup = pickBest(setups)
  const worstSetup = pickWorst(setups)
  const bestSymbol = pickBest(symbols)
  const worstSymbol = pickWorst(symbols)
  const bestSide = pickBest(sides)

  const strategy = strategyText.trim()
  const winPlaybooks = playbook
    .filter((entry) => resolvePlaybookOutcome(entry) === 'win')
    .sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))
  const lossPlaybooks = playbook
    .filter((entry) => resolvePlaybookOutcome(entry) === 'loss')
    .sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0))

  const biggestLosses = [...closed]
    .filter((t) => classifyTradeOutcomeWithOptions(t, paper) === 'loss')
    .sort((a, b) => a.pnl - b.pnl)
    .slice(0, 3)

  const winTrades = closed.filter((t) => classifyTradeOutcomeWithOptions(t, paper) === 'win')
  const winSetups = topCounts([
    ...winPlaybooks.map((entry) => entry.setup ?? ''),
    ...winTrades.map((trade) => trade.setup ?? ''),
  ])
  const winSides = topCounts([
    ...winPlaybooks.map((entry) => (entry.side === 'short' ? '空头' : '多头')),
    ...winTrades.map((trade) => (trade.side === 'short' ? '空头' : '多头')),
  ])
  const winSymbols = topCounts([
    ...winPlaybooks.map((entry) => entry.symbol),
    ...winTrades.map((trade) => trade.symbol),
  ])
  const winNotes = uniqueSnippets([
    ...winPlaybooks.map((entry) => entry.thesis),
    ...winPlaybooks.map((entry) => entry.lessons),
    ...winTrades.map((trade) => trade.notes),
  ])

  const strategyTokens = tokenize(strategy)
  const strategySet = new Set(strategyTokens)
  const winNoteTokens = tokenize(winNotes.join(' '))
  const aligned = overlapTokens(winNoteTokens, strategySet)

  const successParts: string[] = []
  if (winPlaybooks.length === 0 && winTrades.length === 0) {
    successParts.push('还没有成功案例。把盈利单写进 Playbook（thesis / lessons），教练才能记住你赢的时候在做什么。')
  } else {
    successParts.push(
      `记下了 ${winPlaybooks.length} 个盈利 Playbook、${winTrades.length} 笔盈利交易。`
    )
    if (winSetups.length) {
      successParts.push(
        `成功时最常见的入场：${winSetups.map(([name, n]) => `${name}（${n}）`).join('、')}。`
      )
    }
    if (winSides.length) {
      successParts.push(`方向更常是${winSides[0][0]}。`)
    }
    if (winSymbols.length) {
      successParts.push(`品种上 ${winSymbols.map(([name]) => name).join('、')} 出现较多。`)
    }
    if (winNotes.length) {
      successParts.push(`你在成功案例里写过：${winNotes.map((note) => `「${note}」`).join(' ')}`)
    } else {
      successParts.push('成功案例还没写 thesis / lessons，补几句「当时为什么进」下次就能当模板。')
    }
    if (strategy && aligned.length) {
      successParts.push(`这些成功记录和你的策略对得上：${aligned.slice(0, 8).join('、')}。继续按这个做。`)
    } else if (strategy) {
      successParts.push('成功案例的文字还没明显出现你策略里的关键词。在盈利单里写清「符合策略的哪一条」。')
    }
  }
  const successSummary = successParts.join(' ')

  const lossSetups = topCounts([
    ...lossPlaybooks.map((entry) => entry.setup ?? ''),
    ...biggestLosses.map((trade) => trade.setup ?? ''),
  ])
  const lossSymbols = topCounts([
    ...lossPlaybooks.map((entry) => entry.symbol),
    ...biggestLosses.map((trade) => trade.symbol),
  ])
  const lossNotes = uniqueSnippets([
    ...lossPlaybooks.map((entry) => entry.lessons),
    ...lossPlaybooks.map((entry) => entry.thesis),
    ...biggestLosses.map((trade) => trade.notes),
  ])
  const winSetupNames = new Set(winSetups.map(([name]) => name))
  const offPlanSetups = lossSetups.filter(([name]) => name && !winSetupNames.has(name))
  const lossTokens = tokenize(lossNotes.join(' '))
  const lossAligned = overlapTokens(lossTokens, strategySet)

  const failureParts: string[] = []
  if (lossPlaybooks.length === 0 && biggestLosses.length === 0) {
    failureParts.push('还没有亏损样本。有亏的时候记进 Playbook，才能对照策略复盘。')
  } else {
    if (lossPlaybooks.length) {
      failureParts.push(
        `亏损 Playbook：${lossPlaybooks.slice(0, 3).map((entry) => {
          const pnl = entry.pnl != null ? ` ${formatCurrency(entry.pnl)}` : ''
          return `「${entry.title || entry.symbol}」${pnl}`
        }).join('、')}。`
      )
    }
    if (biggestLosses.length) {
      failureParts.push(
        `最大亏损交易：${biggestLosses.map((trade) => {
          const setup = trade.setup ? ` / ${trade.setup}` : ''
          return `${trade.symbol}${setup} ${formatCurrency(trade.pnl)}`
        }).join('；')}。`
      )
    }
    if (lossSetups.length) {
      failureParts.push(`失败常见入场：${lossSetups.map(([name, n]) => `${name}（${n}）`).join('、')}。`)
    }
    if (offPlanSetups.length && winSetupNames.size) {
      failureParts.push(
        `这些失败入场几乎没出现在成功案例里：${offPlanSetups.map(([name]) => name).join('、')}，更像是偏离了你赢的时候的做法。`
      )
    }
    if (lossSymbols.length) {
      failureParts.push(`失败品种：${lossSymbols.map(([name, n]) => `${name}（${n}）`).join('、')}。`)
    }
    if (lossNotes.length) {
      failureParts.push(`你自己写的失败教训：${lossNotes.map((note) => `「${note}」`).join(' ')}`)
    } else {
      failureParts.push('亏损案例还没写 lessons，补一句「当时错在哪」。')
    }
    if (strategy && lossAligned.length === 0) {
      failureParts.push('这些失败记录对不上你写下的策略关键词，很像是临场加戏，而不是按计划做。')
    } else if (strategy && aligned.length && lossAligned.length) {
      const onlyLoss = lossAligned.filter((token) => !aligned.includes(token))
      if (onlyLoss.length) {
        failureParts.push(`失败记录里出现、但成功案例很少提的词：${onlyLoss.slice(0, 6).join('、')}，值得对照策略删掉这类做法。`)
      }
    }
    if (stats.avgWin > 0 && stats.avgLoss > stats.avgWin) {
      failureParts.push(
        `平均亏损 ${formatCurrency(stats.avgLoss)} 大于平均盈利 ${formatCurrency(stats.avgWin)}，止损可以更近，或按成功案例那样让盈利单多拿一会儿。`
      )
    }
    if (winSetups[0] && lossSetups[0] && winSetups[0][0] !== lossSetups[0][0]) {
      failureParts.push(
        `提高办法：优先只做成功模板「${winSetups[0][0]}」，少做失败高频「${lossSetups[0][0]}」。下单前用策略核对一遍。`
      )
    } else if (strategy) {
      failureParts.push('提高办法：每笔先问「这符合我写下的策略吗？」不符合就过掉。')
    }
  }
  const failureSummary = failureParts.join(' ')
  const today = buildTodaySummary(trades, playbook, journal, paper, strategy, date)

  const insights: CoachInsight[] = []

  if (stats.closedTrades === 0 && playbook.length === 0) {
    insights.push({
      id: 'empty',
      kind: 'sample',
      title: '还没有可分析的数据',
      body: '先在当前账户记几笔已平仓交易，或往 Playbook 放案例，并在上方写下你的策略，教练才能对照学习。',
      href: '/add-trade',
    })
    if (!strategy) {
      insights.push({
        id: 'need-strategy',
        kind: 'strategy',
        title: '先告诉教练你的策略',
        body: '用几句话写下入场条件、不做的情况、止损/止盈规则。之后会用它对照你的成功和失败案例。',
      })
    } else {
      const preview = strategy.length > 120 ? `${strategy.slice(0, 120)}…` : strategy
      insights.push({
        id: 'strategy-note',
        kind: 'strategy',
        title: '已记住你的策略',
        body: `当前策略：「${preview}」。有成功/失败案例后，会按这份规则对照学习。`,
      })
    }
    return {
      stats,
      insights,
      setups,
      symbols,
      sides,
      lossPlaybooks,
      winPlaybooks,
      biggestLosses,
      strategy,
      successSummary,
      failureSummary,
      today,
    }
  }

  if (stats.closedTrades > 0 && stats.closedTrades < MIN_OVERVIEW_SAMPLE) {
    insights.push({
      id: 'sample-small',
      kind: 'sample',
      title: '样本偏少，结论先当参考',
      body: `当前只有 ${stats.closedTrades} 笔已平仓（建议至少 ${MIN_OVERVIEW_SAMPLE} 笔）。下面的建议能看方向，但还不够稳，别据此大幅改策略。`,
    })
  }

  if (stats.closedTrades > 0) {
    const pf = stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)
    const rText = stats.avgR !== 0 ? `，平均 R ${stats.avgR.toFixed(2)}` : ''
    insights.push({
      id: 'overview',
      kind: 'overview',
      title: stats.expectancy >= 0 ? '总评：这套做法目前赚得到钱' : '总评：整体期望值为负',
      body: `已平仓 ${stats.closedTrades} 笔：胜率 ${formatPercent(stats.winRate)}（${stats.winningTrades}W / ${stats.breakEvenTrades}BE / ${stats.losingTrades}L），期望值 ${formatCurrency(stats.expectancy)}，盈亏比 ${pf}，合计 ${formatCurrency(stats.totalPnl)}${rText}。`,
    })
  }

  if (!strategy) {
    insights.push({
      id: 'need-strategy',
      kind: 'strategy',
      title: '先告诉教练你的策略',
      body: '在上方写下入场条件、过滤规则、止损止盈。教练会拿它当尺子，去学你的成功案例、对照失败案例。',
    })
  } else {
    const preview = strategy.length > 120 ? `${strategy.slice(0, 120)}…` : strategy
    insights.push({
      id: 'strategy-note',
      kind: 'strategy',
      title: '已记住你的策略',
      body: `当前策略：「${preview}」。下面的成功模板和失败总结都按这份规则对照，不是通用鸡汤。`,
    })
  }

  insights.push({
    id: 'success-learn',
    kind: 'success',
    title: winPlaybooks.length + winTrades.length > 0 ? '从成功案例里学到的模板' : '还没有成功模板',
    body: successSummary,
    href: '/playbook',
  })

  const payoff = payoffAdvice(stats)
  if (stats.closedTrades > 0) {
    const winPart = stats.winningTrades
      ? (stats.winRate / 100) * stats.avgWin
      : 0
    const losePart = stats.losingTrades
      ? ((100 - stats.winRate) / 100) * stats.avgLoss
      : 0
    insights.push({
      id: 'expectancy',
      kind: 'expectancy',
      title: '期望值怎么拆',
      body: `粗算：胜率 × 平均盈利 − 败率 × 平均亏损 ≈ ${formatPercent(stats.winRate)} × ${formatCurrency(stats.avgWin)} − ${formatPercent(100 - stats.winRate)} × ${formatCurrency(stats.avgLoss)}（约 ${formatCurrency(winPart - losePart)}）。${payoff.text}`,
    })
  }

  if (bestSetup && (bestSetup.expectancy > stats.expectancy || bestSetup.expectancy > 0)) {
    insights.push({
      id: 'edge-setup',
      kind: 'edge',
      title: `可多做：${bestSetup.label}`,
      body: `${formatGroup(bestSetup)}。相对整体期望 ${formatCurrency(stats.expectancy)} 更好，仓位可以往这个入场倾斜。`,
    })
  } else if (bestSymbol && bestSymbol.expectancy > stats.expectancy) {
    insights.push({
      id: 'edge-symbol',
      kind: 'edge',
      title: `可多做：${bestSymbol.label}`,
      body: `${formatGroup(bestSymbol)}。这个品种比整体更赚。`,
    })
  } else if (bestSide && bestSide.expectancy > stats.expectancy) {
    insights.push({
      id: 'edge-side',
      kind: 'edge',
      title: `可多做：${bestSide.label}`,
      body: `${formatGroup(bestSide)}。方向上这一侧更稳。`,
    })
  } else if (setups.length === 0 && stats.closedTrades > 0) {
    insights.push({
      id: 'edge-missing-setup',
      kind: 'edge',
      title: '交易还没标 setup',
      body: '记一笔时填上 Breakout / Pullback 等入场类型，才能比较哪个点更好。',
      href: '/add-trade',
    })
  }

  if (worstSetup && worstSetup.key !== bestSetup?.key) {
    insights.push({
      id: 'avoid-setup',
      kind: 'avoid',
      title: `该少做：${worstSetup.label}`,
      body: `${formatGroup(worstSetup)}。先停或缩小这个入场，直到期望回到整体水平以上。`,
    })
  } else if (worstSymbol && worstSymbol.key !== bestSymbol?.key && worstSymbol.expectancy < 0) {
    insights.push({
      id: 'avoid-symbol',
      kind: 'avoid',
      title: `该少做：${worstSymbol.label}`,
      body: `${formatGroup(worstSymbol)}。这个品种在拖后腿。`,
    })
  }

  if (lossPlaybooks.length > 0 || biggestLosses.length > 0) {
    insights.push({
      id: 'loss-review',
      kind: 'loss',
      title: '失败案例总结与提高',
      body: failureSummary,
      href: '/playbook',
    })
  }

  const winCases = playbook.filter((entry) => resolvePlaybookOutcome(entry) === 'win').length
  const lossCases = playbook.filter((entry) => resolvePlaybookOutcome(entry) === 'loss').length
  const noLesson = playbook.filter((entry) => !entry.lessons?.trim()).length
  const noChart = playbook.filter((entry) => !hasEntryChart(entry)).length
  const gapParts: string[] = []
  if (playbook.length === 0) {
    gapParts.push('Playbook 还是空的。把几笔典型盈亏做成案例，教练才能对照入场图和教训。')
  } else {
    if (playbook.length < 5) gapParts.push(`只有 ${playbook.length} 个案例，再补几笔更有代表性的。`)
    if (winCases > 0 && lossCases === 0) gapParts.push(`目前 ${winCases} 个都是盈利案例，缺亏损复盘，容易只记得赢的样子。`)
    if (lossCases > 0 && winCases === 0) gapParts.push('目前只有亏损案例，补几笔「好入场」方便对照。')
    if (noLesson > 0) gapParts.push(`${noLesson} 个案例没有 lessons。`)
    if (noChart > 0) gapParts.push(`${noChart} 个案例没有 Entry / 图链接。`)
  }
  if (gapParts.length > 0) {
    insights.push({
      id: 'playbook-gap',
      kind: 'playbook',
      title: playbook.length === 0 ? 'Playbook 还没开始' : 'Playbook 还可以补',
      body: gapParts.join(' '),
      href: '/playbook',
    })
  }

  return {
    stats,
    insights,
    setups,
    symbols,
    sides,
    bestSetup,
    worstSetup,
    bestSymbol,
    worstSymbol,
    bestSide,
    lossPlaybooks,
    winPlaybooks,
    biggestLosses,
    strategy,
    successSummary,
    failureSummary,
    today,
  }
}

export function answerCoachQuestion(rawQuery: string, report: CoachReport): { title: string; body: string } {
  const query = rawQuery.trim().toLowerCase()
  const { stats, bestSetup, worstSetup, bestSymbol, worstSymbol, bestSide, lossPlaybooks, biggestLosses, setups } = report

  if (!query) {
    return {
      title: '可以问这些问题',
      body: COACH_PRESETS.map((p) => p.label).join('、') + '。用你账本里的数字回答，不会编造。',
    }
  }

  const mentions = (keys: string[]) => keys.some((key) => query.includes(key))

  if (mentions(['今日', '今天', '小结', 'daily', 'today'])) {
    return {
      title: report.today.headline,
      body: report.today.body,
    }
  }

  if (mentions(['成功', '赢', '盈利案例', '学到', '模板'])) {
    return {
      title: '成功案例学到什么',
      body: report.successSummary || '还没有成功案例可学。',
    }
  }

  if (mentions(['策略', '差在', '偏离', '计划'])) {
    if (!report.strategy) {
      return {
        title: '还没记下策略',
        body: '先在上方写下你的交易策略，我才能对照成功和失败案例看你有没有按计划做。',
      }
    }
    return {
      title: '失败和策略差在哪',
      body: [report.insights.find((i) => i.kind === 'strategy')?.body, report.failureSummary]
        .filter(Boolean)
        .join(' '),
    }
  }

  if (mentions(['playbook', '图鉴', '缺什么', 'lesson'])) {
    const playbookInsight = report.insights.find((i) => i.kind === 'playbook')
    return {
      title: playbookInsight?.title ?? 'Playbook',
      body: playbookInsight?.body ?? 'Playbook 数据还不够，先加几个案例。',
    }
  }

  if (mentions(['品种', '标的', 'symbol', '最差品种', '哪个品种'])) {
    if (worstSymbol) {
      return {
        title: `最弱品种：${worstSymbol.label}`,
        body: `${formatGroup(worstSymbol)}。${bestSymbol && bestSymbol.key !== worstSymbol.key ? `对照更好的是 ${formatGroup(bestSymbol)}。` : ''}`,
      }
    }
    return { title: '还看不出品种差异', body: '交易里品种样本不够，或还没分开记录。多记几笔后再问。' }
  }

  if (mentions(['期望', 'expectancy', '为什么是'])) {
    const insight = report.insights.find((i) => i.kind === 'expectancy')
    return {
      title: insight?.title ?? '期望值',
      body: insight?.body ?? '还没有已平仓交易，算不出期望值。',
    }
  }

  if (mentions(['胜率', '盈亏比', '提高', '还是'])) {
    return {
      title: '该提高胜率还是盈亏比',
      body: payoffAdvice(stats).text,
    }
  }

  if (mentions(['亏', '亏钱', '亏损', '失败', '怎么改', '怎么总结', '踩坑'])) {
    if (report.failureSummary) return { title: '失败案例怎么总结', body: report.failureSummary }
    const insight = report.insights.find((i) => i.kind === 'loss')
    if (insight) return { title: insight.title, body: insight.body }
    if (lossPlaybooks.length === 0 && biggestLosses.length === 0) {
      return { title: '还没有亏损样本', body: '当前账户没有标记为亏损的交易或 Playbook。有亏损时记下来，才能复盘。' }
    }
  }

  if (mentions(['入场', 'setup', '最好', '多做', '哪个好'])) {
    if (bestSetup) {
      return {
        title: `最好的入场：${bestSetup.label}`,
        body: `${formatGroup(bestSetup)}。${worstSetup && worstSetup.key !== bestSetup.key ? `相对最弱的是 ${formatGroup(worstSetup)}，可以少做。` : ''}${bestSide ? ` 方向上 ${bestSide.label} 更好。` : ''}`,
      }
    }
    if (setups.length === 0) {
      return {
        title: '还没标 setup',
        body: '交易没有填写入场类型，无法比较哪个点更好。记交易时补上 setup。',
      }
    }
    return { title: '入场样本还不够', body: '每个 setup 至少要有几笔，才能说哪个更好。' }
  }

  if (mentions(['总评', '整体', '怎么样', '表现'])) {
    const overview = report.insights.find((i) => i.kind === 'overview')
    if (overview) return { title: overview.title, body: overview.body }
  }

  return {
    title: '这个问题我按关键词答不了',
    body: `我只能根据当前账户的交易和 Playbook 回答：${COACH_PRESETS.map((p) => p.label).join('、')}。换一个试试，或点下面的问题。`,
  }
}
