import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Pencil, Trash2, X, BookOpen, Sparkles, TrendingUp, TrendingDown,
  Star, ArrowDownUp,
} from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { AccountScopeBanner } from '../components/AccountScopeBanner'
import { ChartLinkFields } from '../components/ChartLinkFields'
import { ChartEmbed } from '../components/ChartEmbed'
import { PnlBadge } from '../components/PnlBadge'
import type { PlaybookEntry, PlaybookOutcome, Trade } from '../types'
import {
  PLAYBOOK_TIMEFRAMES, PLAYBOOK_SLOT_LABELS,
  playbookOutcomeFromPnl, resolvePlaybookOutcome,
} from '../types'
import { countValidCharts, mergePlaybookChartSlots, validatePlaybookCharts } from '../utils/chartLinks'
import { formatCurrency } from '../utils/stats'
import { isLosingTrade, isWinningTrade } from '../utils/stats'
import { cn } from '../utils/cn'

const EMPTY_FORM = {
  title: '',
  symbol: '',
  entryDate: '',
  thesis: '',
  lessons: '',
  setup: '',
  tags: '',
  outcome: 'win' as PlaybookOutcome,
  pnl: '',
  rMultiple: '',
  maxRr: '',
  stopLoss: '',
  accountBalance: '',
}

type DateSort = 'newest' | 'oldest'
type OutcomeFilter = 'all' | 'win' | 'loss'

const SORT_STORAGE_KEY = 'trade-journal-playbook-sort'
const OUTCOME_FILTER_KEY = 'trade-journal-playbook-outcome-filter'

function todayLocalDate(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function toDateInputValue(value?: string): string {
  if (!value) return todayLocalDate()
  return value.slice(0, 10)
}

function loadSort(): DateSort {
  try {
    return localStorage.getItem(SORT_STORAGE_KEY) === 'oldest' ? 'oldest' : 'newest'
  } catch {
    return 'newest'
  }
}

function loadOutcomeFilter(): OutcomeFilter {
  try {
    const raw = localStorage.getItem(OUTCOME_FILTER_KEY)
    if (raw === 'win' || raw === 'loss' || raw === 'all') return raw
  } catch {
    /* ignore */
  }
  return 'all'
}

export function PlaybookPage() {
  const {
    filteredPlaybook,
    filteredTrades,
    selectedAccount,
    accountProfiles,
    accountInfos,
    savePlaybookEntry,
    deletePlaybookEntry,
    togglePlaybookPinned,
    addTrade,
    updateTrade,
    updateAccount,
  } = useTradeStore()

  const [search, setSearch] = useState('')
  const [dateSort, setDateSort] = useState<DateSort>(loadSort)
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>(loadOutcomeFilter)
  const [editing, setEditing] = useState<PlaybookEntry | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [pickerTab, setPickerTab] = useState<'win' | 'loss'>('win')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [charts, setCharts] = useState(mergePlaybookChartSlots())

  const editingAccountId = editing?.account?.trim() || (selectedAccount !== 'all' ? selectedAccount : '')
  const editingIsPaper = Boolean(
    editingAccountId && accountProfiles.find((p) => p.id === editingAccountId)?.isPaper
  )

  const closedCandidates = useMemo(
    () => filteredTrades
      .filter((t) => t.status === 'closed')
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate)),
    [filteredTrades]
  )

  const pickerCandidates = useMemo(
    () => closedCandidates
      .filter((t) => (pickerTab === 'win' ? isWinningTrade(t.pnl) : isLosingTrade(t.pnl)))
      .slice(0, 50),
    [closedCandidates, pickerTab]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = !q
      ? [...filteredPlaybook]
      : filteredPlaybook.filter((entry) =>
          entry.symbol.toLowerCase().includes(q) ||
          entry.title.toLowerCase().includes(q) ||
          entry.setup?.toLowerCase().includes(q) ||
          entry.thesis?.toLowerCase().includes(q) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(q))
        )

    if (outcomeFilter !== 'all') {
      list = list.filter((entry) => resolvePlaybookOutcome(entry) === outcomeFilter)
    }

    list.sort((a, b) => {
      const pinDiff = Number(!!b.pinned) - Number(!!a.pinned)
      if (pinDiff !== 0) return pinDiff
      const dateA = a.entryDate.slice(0, 10)
      const dateB = b.entryDate.slice(0, 10)
      return dateSort === 'newest' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB)
    })

    return list
  }, [filteredPlaybook, search, dateSort, outcomeFilter])

  const outcomeCounts = useMemo(() => {
    let win = 0
    let loss = 0
    for (const entry of filteredPlaybook) {
      const o = resolvePlaybookOutcome(entry)
      if (o === 'win') win += 1
      else if (o === 'loss') loss += 1
    }
    return { win, loss, all: filteredPlaybook.length }
  }, [filteredPlaybook])

  const setSort = (next: DateSort) => {
    setDateSort(next)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const setOutcome = (next: OutcomeFilter) => {
    setOutcomeFilter(next)
    try {
      localStorage.setItem(OUTCOME_FILTER_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const openNew = () => {
    setSaveError(null)
    const today = todayLocalDate()
    const account = selectedAccount !== 'all' ? selectedAccount : ''
    const profile = account ? accountProfiles.find((p) => p.id === account) : undefined
    const balance =
      profile?.startingCapital ?? profile?.totalDeposits ?? profile?.currentCapital
    setEditing({
      id: '',
      symbol: '',
      side: 'long',
      account,
      entryDate: `${today}T12:00:00.000Z`,
      entryPrice: 0,
      outcome: 'win',
      title: '',
      journalDate: today,
      charts: mergePlaybookChartSlots(),
      tags: [],
      createdAt: '',
      updatedAt: '',
    })
    setForm({
      ...EMPTY_FORM,
      entryDate: today,
      outcome: 'win',
      accountBalance: balance != null ? String(balance) : '',
    })
    setCharts(mergePlaybookChartSlots())
  }

  const openEdit = (entry: PlaybookEntry) => {
    setSaveError(null)
    const linkedTrade = entry.tradeId ? filteredTrades.find((t) => t.id === entry.tradeId) : undefined
    const account = entry.account.trim() || linkedTrade?.account || (selectedAccount !== 'all' ? selectedAccount : '')
    const outcome = resolvePlaybookOutcome(entry) ?? 'win'
    const profile = account ? accountProfiles.find((p) => p.id === account) : undefined
    const balance =
      profile?.startingCapital ?? profile?.totalDeposits ?? profile?.currentCapital
    setEditing({ ...entry, account, outcome })
    setForm({
      title: entry.title,
      symbol: entry.symbol,
      entryDate: toDateInputValue(entry.entryDate),
      thesis: entry.thesis ?? '',
      lessons: entry.lessons ?? '',
      setup: entry.setup ?? '',
      tags: entry.tags.join(', '),
      outcome,
      pnl: entry.pnl != null ? String(entry.pnl) : linkedTrade?.pnl != null ? String(linkedTrade.pnl) : '',
      rMultiple: linkedTrade?.rMultiple != null ? String(linkedTrade.rMultiple) : '',
      maxRr: linkedTrade?.maxRr != null ? String(linkedTrade.maxRr) : '',
      stopLoss: linkedTrade?.stopLoss != null ? String(linkedTrade.stopLoss) : '',
      accountBalance: balance != null ? String(balance) : '',
    })
    setCharts(mergePlaybookChartSlots(entry.charts))
  }

  const openEditorFromTrade = (trade: Trade) => {
    setSaveError(null)
    const tradeDate = toDateInputValue(trade.entryDate)
    const outcome = playbookOutcomeFromPnl(trade.pnl) ?? 'breakeven'
    const caseLabel = outcome === 'win' ? '盈利案例' : outcome === 'loss' ? '亏损案例' : '持平案例'
    setEditing({
      id: '',
      tradeId: trade.id,
      symbol: trade.symbol,
      side: trade.side,
      account: trade.account,
      entryDate: trade.entryDate,
      exitDate: trade.exitDate,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      pnl: trade.pnl,
      outcome,
      setup: trade.setup,
      title: '',
      journalDate: tradeDate,
      charts: mergePlaybookChartSlots(trade.entryCharts),
      tags: [],
      createdAt: '',
      updatedAt: '',
    })
    setForm({
      ...EMPTY_FORM,
      symbol: trade.symbol,
      entryDate: tradeDate,
      setup: trade.setup ?? '',
      title: `${trade.symbol} ${trade.setup ?? caseLabel}`,
      thesis: trade.notes ?? '',
      outcome: outcome === 'breakeven' ? 'win' : outcome,
    })
    setCharts(mergePlaybookChartSlots(trade.entryCharts))
  }

  const closeEditor = () => {
    setEditing(null)
    setSaveError(null)
    setForm(EMPTY_FORM)
    setCharts(mergePlaybookChartSlots())
  }

  const handleSave = () => {
    if (!editing) return

    const errors: string[] = []
    const { valid: validCharts, error: chartError } = validatePlaybookCharts(charts)
    if (chartError) errors.push(chartError)

    const symbol = form.symbol.trim().toUpperCase()
    if (!symbol) {
      errors.push('请填写交易品种')
    }

    const entryDate = form.entryDate.trim()
    if (!entryDate) {
      errors.push('请选择交易日期')
    }

    const linkedTrade = editing.tradeId ? filteredTrades.find((t) => t.id === editing.tradeId) : undefined
    const account =
      editing.account.trim() ||
      linkedTrade?.account ||
      (selectedAccount !== 'all' ? selectedAccount : '')

    if (!account) {
      errors.push('请先在顶部标签栏选择一个具体账户（不要选「全部账户」），或使用「从交易添加」')
    }

    const isPaper = Boolean(account && accountProfiles.find((p) => p.id === account)?.isPaper)
    let paperPnl: number | undefined
    let paperR: number | undefined
    let paperMaxRr: number | undefined
    let paperStopLoss: number | undefined

    if (isPaper && !editing.tradeId) {
      if (form.pnl === '' || Number.isNaN(Number(form.pnl))) {
        errors.push('模拟账户请填写盈亏金额 ($)，保存后会计入交易统计')
      } else {
        paperPnl = Number(form.pnl)
      }
      if (form.rMultiple.trim() && !Number.isNaN(Number(form.rMultiple))) {
        paperR = Number(form.rMultiple)
      }
      if (form.maxRr.trim() && !Number.isNaN(Number(form.maxRr))) {
        paperMaxRr = Number(form.maxRr)
      }
      if (form.stopLoss.trim() && !Number.isNaN(Number(form.stopLoss))) {
        paperStopLoss = Number(form.stopLoss)
      }
    } else if (isPaper && editing.tradeId) {
      if (form.pnl !== '' && !Number.isNaN(Number(form.pnl))) paperPnl = Number(form.pnl)
      if (form.rMultiple.trim() && !Number.isNaN(Number(form.rMultiple))) paperR = Number(form.rMultiple)
      if (form.maxRr.trim() && !Number.isNaN(Number(form.maxRr))) paperMaxRr = Number(form.maxRr)
      if (form.stopLoss.trim() && !Number.isNaN(Number(form.stopLoss))) paperStopLoss = Number(form.stopLoss)
    }

    if (errors.length > 0) {
      setSaveError(errors.join(' · '))
      return
    }

    setSaveError(null)

    let tradeId = editing.tradeId
    const entryIso = `${entryDate}T12:00:00.000Z`
    const resolvedPnl =
      paperPnl ??
      editing.pnl ??
      (form.outcome === 'win' ? 1 : form.outcome === 'loss' ? -1 : 0)

    if (isPaper && account) {
      if (!tradeId) {
        tradeId = addTrade({
          symbol,
          side: editing.side,
          status: 'closed',
          entryDate: entryIso,
          exitDate: entryIso,
          entryPrice: 0,
          exitPrice: 0,
          quantity: 1,
          fees: 0,
          pnl: paperPnl!,
          rMultiple: paperR,
          maxRr: paperMaxRr,
          stopLoss: paperStopLoss,
          setup: form.setup.trim() || undefined,
          tags: form.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
          notes: form.thesis.trim() || undefined,
          account,
        })
      } else if (paperPnl != null || paperR != null || paperMaxRr != null || paperStopLoss != null) {
        updateTrade(tradeId, {
          symbol,
          entryDate: entryIso,
          exitDate: entryIso,
          ...(paperPnl != null ? { pnl: paperPnl } : {}),
          ...(paperR != null ? { rMultiple: paperR } : {}),
          ...(paperMaxRr != null ? { maxRr: paperMaxRr } : {}),
          ...(paperStopLoss != null ? { stopLoss: paperStopLoss } : {}),
          setup: form.setup.trim() || undefined,
        })
      }

      const balance = form.accountBalance.trim() ? Number(form.accountBalance) : undefined
      if (balance != null && !Number.isNaN(balance) && balance > 0) {
        const priorPnl = accountInfos.find((a) => a.id === account)?.totalPnl ?? 0
        const delta =
          paperPnl != null && !editing.tradeId
            ? paperPnl
            : paperPnl != null && linkedTrade
              ? paperPnl - linkedTrade.pnl
              : 0
        updateAccount(account, {
          isPaper: true,
          startingCapital: balance,
          totalDeposits: balance,
          currentCapital: balance + priorPnl + delta,
        })
      }
    }

    savePlaybookEntry({
      id: editing.id || undefined,
      tradeId,
      symbol,
      side: editing.side,
      account,
      entryDate: entryIso,
      exitDate: editing.exitDate ?? (isPaper ? entryIso : undefined),
      entryPrice: editing.entryPrice,
      exitPrice: editing.exitPrice,
      pnl: isPaper ? (paperPnl ?? editing.pnl ?? resolvedPnl) : editing.pnl,
      outcome: form.outcome,
      title: form.title.trim() || symbol,
      thesis: form.thesis.trim() || undefined,
      lessons: form.lessons.trim() || undefined,
      setup: form.setup.trim() || undefined,
      journalDate: entryDate,
      charts: validCharts,
      tags: form.tags.split(/[,;]/).map((t) => t.trim()).filter(Boolean),
      pinned: editing.pinned ?? false,
    })
    closeEditor()
  }

  const handlePickTrade = (tradeId: string) => {
    const existing = filteredPlaybook.find((p) => p.tradeId === tradeId)
    if (existing) {
      openEdit(existing)
    } else {
      const trade = filteredTrades.find((t) => t.id === tradeId)
      if (trade) openEditorFromTrade(trade)
    }
    setShowPicker(false)
  }

  return (
    <div className="space-y-6">
      <AccountScopeBanner />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-violet-500" />
            <h1 className="page-title">Playbook</h1>
          </div>
          <p className="page-subtitle mt-1">
            收藏盈利与亏损交易模板，复盘成功经验，也警惕失败模式
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              setPickerTab('win')
              setShowPicker(true)
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300"
          >
            <TrendingUp className="h-4 w-4" />
            从交易添加
          </button>
          <button
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            新建案例
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-brand-50 p-4 text-sm text-slate-700 dark:border-violet-900/50 dark:from-violet-950/40 dark:to-brand-950/40 dark:text-slate-300">
        <p className="font-medium text-slate-900 dark:text-slate-100">使用 TradingView 链接，保存后即可预览</p>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          快照链接（<code className="text-xs text-slate-700 dark:text-slate-300">/x/...</code>）会自动显示截图预览；
          布局链接（<code className="text-xs text-slate-700 dark:text-slate-300">/chart/...</code>）可内嵌交互式 K 线。
          无需单独贴图，登录云端后数据保存在 Supabase。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标的、策略、标签…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-surface-700 dark:bg-surface-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-1">
          {(
            [
              ['all', '全部', outcomeCounts.all],
              ['win', '盈利', outcomeCounts.win],
              ['loss', '亏损', outcomeCounts.loss],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => setOutcome(value)}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                outcomeFilter === value
                  ? value === 'loss'
                    ? 'bg-red-600 text-white'
                    : value === 'win'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-brand-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-surface-800'
              )}
            >
              {label}
              <span className="ml-1 opacity-80">{count}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-1">
          <ArrowDownUp className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
          <button
            type="button"
            onClick={() => setSort('newest')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              dateSort === 'newest' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-surface-800'
            )}
          >
            最新优先
          </button>
          <button
            type="button"
            onClick={() => setSort('oldest')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              dateSort === 'oldest' ? 'bg-brand-600 text-white' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-surface-800'
            )}
          >
            最旧优先
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-surface-600 bg-white dark:bg-surface-900 px-6 py-16 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-700 dark:text-slate-300">
            {outcomeFilter === 'loss'
              ? '还没有亏损复盘案例'
              : outcomeFilter === 'win'
                ? '还没有盈利图鉴案例'
                : '还没有收藏的交易案例'}
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">从已平仓交易一键添加，或手动创建多周期图鉴</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {filtered.map((entry) => (
            <PlaybookCard
              key={entry.id}
              entry={entry}
              onEdit={() => openEdit(entry)}
              onTogglePin={() => togglePlaybookPinned(entry.id)}
              onDelete={() => {
                if (confirm(`确定删除「${entry.title}」？`)) deletePlaybookEntry(entry.id)
              }}
            />
          ))}
        </div>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">从交易添加案例</h2>
              <button onClick={() => setShowPicker(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-800">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mb-4 inline-flex w-full rounded-lg border border-slate-200 dark:border-surface-700 p-1">
              <button
                type="button"
                onClick={() => setPickerTab('win')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium',
                  pickerTab === 'win' ? 'bg-emerald-600 text-white' : 'text-slate-600 dark:text-slate-400'
                )}
              >
                <TrendingUp className="h-3.5 w-3.5" />
                盈利交易
              </button>
              <button
                type="button"
                onClick={() => setPickerTab('loss')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-xs font-medium',
                  pickerTab === 'loss' ? 'bg-red-600 text-white' : 'text-slate-600 dark:text-slate-400'
                )}
              >
                <TrendingDown className="h-3.5 w-3.5" />
                亏损交易
              </button>
            </div>
            {pickerCandidates.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                当前账户下暂无已平仓{pickerTab === 'win' ? '盈利' : '亏损'}交易
              </p>
            ) : (
              <div className="space-y-2">
                {pickerCandidates.map((trade) => (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => handlePickTrade(trade.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left',
                      trade.pnl < 0
                        ? 'border-slate-200 dark:border-surface-700 hover:border-red-300 hover:bg-red-50/50 dark:hover:bg-red-950/20'
                        : 'border-slate-200 dark:border-surface-700 hover:border-violet-300 hover:bg-violet-50/50'
                    )}
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-slate-100">{trade.symbol}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {trade.entryDate.slice(0, 10)} · {trade.side === 'long' ? '做多' : '做空'}
                      </p>
                    </div>
                    <PnlBadge value={trade.pnl} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {editing.id ? '编辑案例' : '新建案例'}
              </h2>
              <button onClick={closeEditor} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-800 dark:bg-surface-800">
                <X className="h-5 w-5" />
              </button>
            </div>

            {(editing.tradeId || editing.entryPrice > 0) && (
              <div className="mb-4 rounded-lg bg-slate-50 dark:bg-surface-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                {form.symbol || editing.symbol} · {form.entryDate || editing.entryDate.slice(0, 10)} · {editing.side === 'long' ? '做多' : '做空'}
                {editing.entryPrice > 0 && <> @ ${editing.entryPrice.toFixed(2)}</>}
                {editing.pnl != null && <span className="ml-2">盈亏 {formatCurrency(editing.pnl)}</span>}
              </div>
            )}

            <div className="space-y-4">
              <Field label="案例类型" hint="盈利图鉴或亏损复盘" required>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, outcome: 'win' }))}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-colors',
                      form.outcome === 'win'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-surface-700 dark:text-slate-400'
                    )}
                  >
                    <TrendingUp className="h-4 w-4" />
                    盈利案例
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, outcome: 'loss' }))}
                    className={cn(
                      'flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-colors',
                      form.outcome === 'loss'
                        ? 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-surface-700 dark:text-slate-400'
                    )}
                  >
                    <TrendingDown className="h-4 w-4" />
                    亏损案例
                  </button>
                </div>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="交易品种" hint="如 MGC、NG、AAPL" required>
                  <input
                    value={form.symbol}
                    onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))}
                    placeholder="MGC"
                    className="form-input uppercase"
                  />
                </Field>
                <Field label="交易日期" hint="默认今天，可改成实际交易日" required>
                  <input
                    type="date"
                    value={form.entryDate}
                    onChange={(e) => setForm((f) => ({ ...f, entryDate: e.target.value }))}
                    className="form-input"
                  />
                </Field>
              </div>

              {editingIsPaper && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-800 dark:bg-violet-950/30">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">
                    模拟交易记录
                  </p>
                  <p className="mb-3 text-xs text-violet-700/90 dark:text-violet-300/80">
                    填写盈亏后保存，会自动生成一笔交易并进入 Dashboard / 日历 / 图表统计。
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="盈亏金额 $" required>
                      <input
                        type="number"
                        step="0.01"
                        value={form.pnl}
                        onChange={(e) => setForm((f) => ({ ...f, pnl: e.target.value }))}
                        placeholder="250 或 -120"
                        className="form-input"
                      />
                    </Field>
                    <Field label="盈亏 R（可选）">
                      <input
                        type="number"
                        step="0.01"
                        value={form.rMultiple}
                        onChange={(e) => setForm((f) => ({ ...f, rMultiple: e.target.value }))}
                        placeholder="2.0 或 -1"
                        className="form-input"
                      />
                    </Field>
                    <Field label="最高收益 Max R">
                      <input
                        type="number"
                        step="0.01"
                        value={form.maxRr}
                        onChange={(e) => setForm((f) => ({ ...f, maxRr: e.target.value }))}
                        placeholder="2.8"
                        className="form-input"
                      />
                    </Field>
                    <Field label="止损金额 ($)">
                      <input
                        type="number"
                        step="0.01"
                        value={form.stopLoss}
                        onChange={(e) => setForm((f) => ({ ...f, stopLoss: e.target.value }))}
                        placeholder="500"
                        className="form-input"
                      />
                    </Field>
                    <Field label="账户总金额设定" hint="写入该模拟账户本金">
                      <input
                        type="number"
                        step="0.01"
                        value={form.accountBalance}
                        onChange={(e) => setForm((f) => ({ ...f, accountBalance: e.target.value }))}
                        placeholder="50000"
                        className="form-input"
                      />
                    </Field>
                  </div>
                </div>
              )}

              <Field label="案例名称" hint="选填；留空时卡片标题使用交易品种">
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder={form.outcome === 'loss' ? '如：追高被打止损' : '如：漂亮的 MB1/MB2'}
                  className="form-input"
                />
              </Field>
              <Field label="策略 / Setup">
                <input
                  value={form.setup}
                  onChange={(e) => setForm((f) => ({ ...f, setup: e.target.value }))}
                  placeholder="突破、回踩、缺口…"
                  className="form-input"
                />
              </Field>
              <Field label={form.outcome === 'loss' ? '问题分析（为何做错）' : '入场逻辑（为何是好交易）'}>
                <textarea
                  value={form.thesis}
                  onChange={(e) => setForm((f) => ({ ...f, thesis: e.target.value }))}
                  rows={3}
                  placeholder={
                    form.outcome === 'loss'
                      ? '情绪、纪律破坏、误读结构…'
                      : '大周期趋势、关键位、量价配合…'
                  }
                  className="form-input resize-none"
                />
              </Field>
              <Field label={form.outcome === 'loss' ? '教训 / 下次如何避免' : '心得 / 可复制的纪律'}>
                <textarea
                  value={form.lessons}
                  onChange={(e) => setForm((f) => ({ ...f, lessons: e.target.value }))}
                  rows={2}
                  placeholder={
                    form.outcome === 'loss'
                      ? '下次遇到类似情况要怎么做…'
                      : '下次遇到类似 setup 要怎么做…'
                  }
                  className="form-input resize-none"
                />
              </Field>
              <Field label="标签（逗号分隔）">
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="breakout, momentum"
                  className="form-input"
                />
              </Field>

              <div>
                <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">
                  EVC 图表链接 <span className="text-red-500 dark:text-red-400">*</span>
                </p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  E Entry · V Validation · C Context · 至少填写其中一项即可
                </p>
                <ChartLinkFields
                  charts={charts}
                  onChange={(next) => {
                    setCharts(next)
                    if (saveError) setSaveError(null)
                  }}
                  timeframes={[...PLAYBOOK_TIMEFRAMES]}
                  showValidation
                />
              </div>
            </div>

            {saveError && (
              <div className="mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-700">
                {saveError}
              </div>
            )}

            {editing.journalDate && (
              <Link
                to={`/journal?date=${editing.journalDate}`}
                onClick={closeEditor}
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-400 hover:underline"
              >
                <BookOpen className="h-4 w-4" />
                关联日记：{editing.journalDate}
              </Link>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={closeEditor} className="flex-1 rounded-lg border border-slate-200 dark:border-surface-700 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-surface-800 dark:bg-surface-800">
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlaybookCard({
  entry,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  entry: PlaybookEntry
  onEdit: () => void
  onDelete: () => void
  onTogglePin: () => void
}) {
  const chartCount = countValidCharts(entry.charts)
  const titleLooksLikeSymbol =
    entry.title.trim().toUpperCase() === entry.symbol.trim().toUpperCase()
  const outcome = resolvePlaybookOutcome(entry)

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-white dark:bg-surface-900 shadow-sm transition-shadow hover:shadow-md',
        entry.pinned
          ? 'border-amber-300 ring-1 ring-amber-200'
          : outcome === 'loss'
            ? 'border-red-200 dark:border-red-900/60'
            : outcome === 'win'
              ? 'border-emerald-200 dark:border-emerald-900/60'
              : 'border-slate-200 dark:border-surface-700'
      )}
    >
      <div className="border-b border-slate-100 dark:border-surface-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">{entry.title}</h3>
              <OutcomeBadge outcome={outcome} />
              {entry.pinned && (
                <span className="shrink-0 rounded-full bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  置顶
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {!titleLooksLikeSymbol && (
                <>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{entry.symbol}</span>
                  {' · '}
                </>
              )}
              {entry.entryDate.slice(0, 10)}
              {entry.pnl != null && (
                <span className="ml-1">
                  · <PnlBadge value={entry.pnl} className="inline" />
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-1">
            <button
              onClick={onTogglePin}
              className={cn(
                'rounded-lg p-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/30',
                entry.pinned ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
              )}
              title={entry.pinned ? '取消置顶' : '置顶'}
            >
              <Star className={cn('h-4 w-4', entry.pinned && 'fill-current')} />
            </button>
            <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-800 hover:text-brand-600 dark:hover:text-brand-400" title="编辑">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-500 dark:hover:text-red-400" title="删除">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        {entry.setup && <p className="mt-2 text-xs font-medium text-violet-700 dark:text-violet-300">{entry.setup}</p>}
        {entry.thesis && <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{entry.thesis}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        {PLAYBOOK_TIMEFRAMES.map((tf) => {
          const chart = entry.charts.find((c) => c.timeframe === tf && c.url.trim())
          if (!chart?.url) {
            return (
              <div
                key={tf}
                className="flex min-h-[9rem] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 dark:border-surface-700 bg-slate-50 dark:bg-surface-800 text-center"
              >
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{tf}</span>
                <span className="mt-0.5 text-[10px] text-slate-400">{PLAYBOOK_SLOT_LABELS[tf]}</span>
              </div>
            )
          }
          return <ChartEmbed key={tf} url={chart.url} timeframe={tf} compact />
        })}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 dark:border-surface-800 px-4 py-3">
        <span className="text-xs text-slate-400">{chartCount} 个图表链接</span>
        {entry.journalDate && (
          <Link
            to={`/journal?date=${entry.journalDate}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
          >
            <BookOpen className="h-3 w-3" />
            当日日记
          </Link>
        )}
      </div>
    </article>
  )
}

function OutcomeBadge({ outcome }: { outcome?: PlaybookOutcome }) {
  if (!outcome || outcome === 'breakeven') return null
  const isWin = outcome === 'win'
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
        isWin
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
          : 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400'
      )}
    >
      {isWin ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {isWin ? '盈利' : '亏损'}
    </span>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
        {required && <span className="ml-0.5 text-red-500 dark:text-red-400">*</span>}
      </label>
      {hint && <p className="mb-1.5 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  )
}
