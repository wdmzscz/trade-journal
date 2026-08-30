import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  TrendingUp, TrendingDown, Scale, BookMarked, AlertTriangle,
  MessageCircle, Send, Target, ScrollText, Star, CalendarDays, NotebookPen,
} from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { AccountScopeBanner } from '../components/AccountScopeBanner'
import { resolvePaperSettings } from '../types'
import {
  COACH_PRESETS,
  answerCoachQuestion,
  buildCoachReport,
  loadCoachStrategy,
  saveCoachStrategy,
  type CoachInsight,
  type CoachInsightKind,
  type TodaySummary,
} from '../lib/coachEngine'
import { formatCurrency, formatPercent } from '../utils/stats'
import { cn } from '../utils/cn'

const KIND_META: Record<CoachInsightKind, { label: string; icon: typeof Target; tone: string }> = {
  overview: {
    label: '总评',
    icon: Target,
    tone: 'border-slate-200 dark:border-surface-700',
  },
  sample: {
    label: '样本',
    icon: AlertTriangle,
    tone: 'border-amber-200 dark:border-amber-800',
  },
  edge: {
    label: '可多做',
    icon: TrendingUp,
    tone: 'border-emerald-200 dark:border-emerald-800',
  },
  avoid: {
    label: '该少做',
    icon: TrendingDown,
    tone: 'border-red-200 dark:border-red-800',
  },
  expectancy: {
    label: '期望值',
    icon: Scale,
    tone: 'border-sky-200 dark:border-sky-800',
  },
  loss: {
    label: '亏损复盘',
    icon: TrendingDown,
    tone: 'border-red-200 dark:border-red-800',
  },
  playbook: {
    label: 'Playbook',
    icon: BookMarked,
    tone: 'border-violet-200 dark:border-violet-800',
  },
  strategy: {
    label: '我的策略',
    icon: ScrollText,
    tone: 'border-brand-200 dark:border-brand-800',
  },
  success: {
    label: '成功模板',
    icon: Star,
    tone: 'border-emerald-200 dark:border-emerald-800',
  },
}

type ChatTurn = {
  role: 'user' | 'coach'
  title?: string
  body: string
}

export function CoachPage() {
  const {
    filteredTrades,
    filteredPlaybook,
    filteredJournal,
    selectedAccount,
    selectedAccountInfo,
    accountProfiles,
    createPlaybookFromTrade,
  } = useTradeStore()
  const navigate = useNavigate()

  const paperSettings = useMemo(() => {
    if (selectedAccount === 'all' || !selectedAccountInfo?.isPaper) return null
    const profile = accountProfiles.find((p) => p.id === selectedAccount)
    return resolvePaperSettings(profile?.paperSettings)
  }, [selectedAccount, selectedAccountInfo, accountProfiles])

  const [strategy, setStrategy] = useState(() => loadCoachStrategy(selectedAccount))
  const [strategySaved, setStrategySaved] = useState(false)
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<ChatTurn[]>([])

  useEffect(() => {
    setStrategy(loadCoachStrategy(selectedAccount))
    setStrategySaved(false)
    setTurns([])
  }, [selectedAccount])

  const report = useMemo(
    () => buildCoachReport(filteredTrades, filteredPlaybook, paperSettings, strategy, filteredJournal),
    [filteredTrades, filteredPlaybook, paperSettings, strategy, filteredJournal]
  )

  const persistStrategy = () => {
    saveCoachStrategy(selectedAccount, strategy)
    setStrategySaved(true)
  }

  const ask = (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    const answer = answerCoachQuestion(trimmed, report)
    setTurns((prev) => [
      ...prev,
      { role: 'user', body: trimmed },
      { role: 'coach', title: answer.title, body: answer.body },
    ])
    setInput('')
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    ask(input)
  }

  const stats = report.stats

  return (
    <div className="space-y-6">
      <AccountScopeBanner />

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title">Coach</h1>
          <span
            title="试用"
            className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/50 dark:text-amber-300"
          >
            Beta
          </span>
          <span className="text-xs text-slate-400">试用</span>
        </div>
        <p className="page-subtitle">
          试用中：打开这一页就会按当前账户重算，包括今天刚记的单。先写下策略，再看今日小结和累计报告。全部在本地算，不用 API。
        </p>
      </div>

      <TodaySummaryCard
        today={report.today}
        onWritePlaybook={(tradeId) => {
          const id = createPlaybookFromTrade(tradeId)
          if (id) navigate('/playbook')
        }}
      />

      <section className="card-surface p-4 sm:p-5">
        <div className="mb-2 flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">我的策略</h2>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          写给这个账户看：入场条件、什么不做、止损止盈、持仓规则。改完点保存，报告会按新策略重算。
        </p>
        <textarea
          value={strategy}
          onChange={(event) => {
            setStrategy(event.target.value)
            setStrategySaved(false)
          }}
          rows={5}
          placeholder="例如：只做趋势回踩（Pullback），突破追单不做；1R 止损，目标至少 2R；开盘前 15 分钟不交易；没有 Validation 确认不进。"
          className="form-input min-h-[120px] resize-y"
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={persistStrategy}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            保存策略
          </button>
          {strategySaved && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400">已记住，报告已按这份策略更新</span>
          )}
        </div>
      </section>

      {stats.closedTrades > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat
            label="胜率"
            value={formatPercent(stats.winRate)}
            hint={`${stats.winningTrades}W / ${stats.breakEvenTrades}BE / ${stats.losingTrades}L`}
            positive={stats.winRate >= 50}
          />
          <MiniStat
            label="期望值"
            value={formatCurrency(stats.expectancy)}
            hint={`${stats.closedTrades} 笔已平仓`}
            positive={stats.expectancy >= 0}
          />
          <MiniStat
            label="盈亏比"
            value={stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)}
            hint={`均盈 ${formatCurrency(stats.avgWin)}`}
            positive={stats.profitFactor >= 1}
          />
          <MiniStat
            label="合计盈亏"
            value={formatCurrency(stats.totalPnl)}
            hint={stats.avgR ? `平均 R ${stats.avgR.toFixed(2)}` : '未填 R'}
            positive={stats.totalPnl >= 0}
          />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">自动报告</h2>
        <div className="grid gap-3 lg:grid-cols-2">
          {report.insights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      </section>

      <section className="card-surface p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-brand-600" />
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">问教练</h2>
        </div>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
          用关键词提问，或点下面的问题。答案来自同一份报告，不会编造。
        </p>
        <div className="mb-4 flex flex-wrap gap-2">
          {COACH_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => ask(preset.query)}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-surface-700 dark:bg-surface-800 dark:text-slate-200 dark:hover:border-brand-600 dark:hover:bg-brand-950/40"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="mb-4 max-h-[360px] space-y-3 overflow-y-auto scrollbar-thin">
          {turns.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-surface-800 dark:text-slate-400">
              还没有提问。试试「今日小结」或「失败和策略差在哪」。
            </p>
          ) : (
            turns.map((turn, index) => (
              <div
                key={`${turn.role}-${index}`}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-sm',
                  turn.role === 'user'
                    ? 'ml-8 bg-brand-600 text-white'
                    : 'mr-4 bg-slate-50 text-slate-800 dark:bg-surface-800 dark:text-slate-100'
                )}
              >
                {turn.title && turn.role === 'coach' && (
                  <p className="mb-1 text-xs font-semibold text-brand-700 dark:text-brand-300">{turn.title}</p>
                )}
                <p className="leading-relaxed">{turn.body}</p>
              </div>
            ))
          )}
        </div>

        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="例如：我该提高胜率还是盈亏比"
            className="form-input"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            问
          </button>
        </form>
      </section>
    </div>
  )
}

function formatDayLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}月${Number(day)}日`
}

function TodaySummaryCard({
  today,
  onWritePlaybook,
}: {
  today: TodaySummary
  onWritePlaybook: (tradeId: string) => void
}) {
  return (
    <section className="card-surface overflow-hidden border-brand-200 dark:border-brand-800">
      <div className="border-b border-slate-100 bg-brand-50/70 px-4 py-3 dark:border-surface-700 dark:bg-brand-950/30 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-brand-600" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">今日小结</h2>
            <span className="text-xs text-slate-500">{formatDayLabel(today.date)}</span>
          </div>
          {!today.empty && today.closedCount > 0 && (
            <p className={cn(
              'text-sm font-bold',
              today.pnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
            )}>
              {formatCurrency(today.pnl)}
            </p>
          )}
        </div>
        <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{today.headline}</p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {!today.empty && (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-surface-800 dark:text-slate-300">
              平仓 {today.closedCount}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-surface-800 dark:text-slate-300">
              未平 {today.openCount}
            </span>
            {today.closedCount > 0 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-surface-800 dark:text-slate-300">
                {today.wins}W / {today.breakEvens}BE / {today.losses}L
              </span>
            )}
          </div>
        )}

        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{today.body}</p>

        {today.trades.length > 0 && (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-100 dark:divide-surface-700 dark:border-surface-700">
            {today.trades.map((trade) => (
              <li key={trade.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-800 dark:text-slate-100">{trade.symbol}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {trade.side === 'short' ? '空' : '多'}
                    {trade.setup ? ` · ${trade.setup}` : ''}
                    {trade.status === 'open' ? ' · 未平' : ''}
                    {trade.hasPlaybook ? ' · 已有案例' : ''}
                  </span>
                </div>
                {trade.status === 'closed' ? (
                  <span className={cn(
                    'text-xs font-semibold',
                    (trade.outcome === 'win' || (trade.outcome === 'breakeven' && trade.pnl >= 0) || (!trade.outcome && trade.pnl >= 0))
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-500 dark:text-red-400'
                  )}>
                    {formatCurrency(trade.pnl)}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">开仓中</span>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Link
            to={`/journal?date=${today.date}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 dark:border-surface-700 dark:text-slate-200 dark:hover:border-brand-600 dark:hover:bg-brand-950/40"
          >
            <NotebookPen className="h-3.5 w-3.5" />
            {today.journalWritten ? '查看今日日记' : '去写今日日记'}
          </Link>
          {today.playbookSuggestions.map((item) => (
            <button
              key={item.tradeId}
              type="button"
              onClick={() => onWritePlaybook(item.tradeId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <BookMarked className="h-3.5 w-3.5" />
              把 {item.symbol} 写入 Playbook
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function MiniStat({
  label,
  value,
  hint,
  positive,
}: {
  label: string
  value: string
  hint: string
  positive: boolean
}) {
  return (
    <div className="card-surface p-4">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('mt-1 text-xl font-bold', positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{hint}</p>
    </div>
  )
}

function InsightCard({ insight }: { insight: CoachInsight }) {
  const meta = KIND_META[insight.kind]
  const Icon = meta.icon
  const inner: ReactNode = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-slate-100 p-1.5 text-slate-600 dark:bg-surface-800 dark:text-slate-300">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{meta.label}</span>
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{insight.title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{insight.body}</p>
    </>
  )

  if (insight.href) {
    return (
      <Link
        to={insight.href}
        className={cn('card-surface block p-4 transition-colors hover:bg-slate-50 dark:hover:bg-surface-800', meta.tone)}
      >
        {inner}
      </Link>
    )
  }

  return <div className={cn('card-surface p-4', meta.tone)}>{inner}</div>
}
