import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, Search, Pencil, Trash2, X, BookOpen, Sparkles, TrendingUp, Star, ArrowDownUp,
} from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { AccountScopeBanner } from '../components/AccountScopeBanner'
import { ChartLinkFields } from '../components/ChartLinkFields'
import { ChartEmbed } from '../components/ChartEmbed'
import { PnlBadge } from '../components/PnlBadge'
import type { PlaybookEntry, Trade } from '../types'
import { PLAYBOOK_TIMEFRAMES, PLAYBOOK_SLOT_LABELS } from '../types'
import { countValidCharts, mergePlaybookChartSlots, validatePlaybookCharts } from '../utils/chartLinks'
import { formatCurrency } from '../utils/stats'
import { cn } from '../utils/cn'

const EMPTY_FORM = {
  title: '',
  symbol: '',
  entryDate: '',
  thesis: '',
  lessons: '',
  setup: '',
  tags: '',
}

type DateSort = 'newest' | 'oldest'

const SORT_STORAGE_KEY = 'trade-journal-playbook-sort'

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

export function PlaybookPage() {
  const {
    filteredPlaybook,
    filteredTrades,
    selectedAccount,
    savePlaybookEntry,
    deletePlaybookEntry,
    togglePlaybookPinned,
  } = useTradeStore()

  const [search, setSearch] = useState('')
  const [dateSort, setDateSort] = useState<DateSort>(loadSort)
  const [editing, setEditing] = useState<PlaybookEntry | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [charts, setCharts] = useState(mergePlaybookChartSlots())

  const winningCandidates = useMemo(
    () => filteredTrades
      .filter((t) => t.status === 'closed' && t.pnl > 0)
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
      .slice(0, 50),
    [filteredTrades]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = !q
      ? [...filteredPlaybook]
      : filteredPlaybook.filter((entry) =>
          entry.symbol.toLowerCase().includes(q) ||
          entry.title.toLowerCase().includes(q) ||
          entry.setup?.toLowerCase().includes(q) ||
          entry.thesis?.toLowerCase().includes(q) ||
          entry.tags.some((tag) => tag.toLowerCase().includes(q))
        )

    list.sort((a, b) => {
      const pinDiff = Number(!!b.pinned) - Number(!!a.pinned)
      if (pinDiff !== 0) return pinDiff
      const dateA = a.entryDate.slice(0, 10)
      const dateB = b.entryDate.slice(0, 10)
      return dateSort === 'newest' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB)
    })

    return list
  }, [filteredPlaybook, search, dateSort])

  const setSort = (next: DateSort) => {
    setDateSort(next)
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  const openNew = () => {
    setSaveError(null)
    const today = todayLocalDate()
    setEditing({
      id: '',
      symbol: '',
      side: 'long',
      account: selectedAccount !== 'all' ? selectedAccount : '',
      entryDate: `${today}T12:00:00.000Z`,
      entryPrice: 0,
      title: '',
      journalDate: today,
      charts: mergePlaybookChartSlots(),
      tags: [],
      createdAt: '',
      updatedAt: '',
    })
    setForm({ ...EMPTY_FORM, entryDate: today })
    setCharts(mergePlaybookChartSlots())
  }

  const openEdit = (entry: PlaybookEntry) => {
    setSaveError(null)
    const linkedTrade = entry.tradeId ? filteredTrades.find((t) => t.id === entry.tradeId) : undefined
    const account = entry.account.trim() || linkedTrade?.account || (selectedAccount !== 'all' ? selectedAccount : '')
    setEditing({ ...entry, account })
    setForm({
      title: entry.title,
      symbol: entry.symbol,
      entryDate: toDateInputValue(entry.entryDate),
      thesis: entry.thesis ?? '',
      lessons: entry.lessons ?? '',
      setup: entry.setup ?? '',
      tags: entry.tags.join(', '),
    })
    setCharts(mergePlaybookChartSlots(entry.charts))
  }

  const openEditorFromTrade = (trade: Trade) => {
    setSaveError(null)
    const tradeDate = toDateInputValue(trade.entryDate)
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
      setup: trade.setup,
      title: '',
      journalDate: tradeDate,
      charts: mergePlaybookChartSlots(trade.entryCharts),
      tags: [],
      createdAt: '',
      updatedAt: '',
    })
    setForm({
      title: '',
      symbol: trade.symbol,
      entryDate: tradeDate,
      thesis: trade.notes ?? '',
      lessons: '',
      setup: trade.setup ?? '',
      tags: '',
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
      errors.push('请先在顶部标签栏选择一个具体账户（不要选「全部账户」），或使用「从盈利交易添加」')
    }

    if (errors.length > 0) {
      setSaveError(errors.join(' · '))
      return
    }

    setSaveError(null)
    savePlaybookEntry({
      id: editing.id || undefined,
      tradeId: editing.tradeId,
      symbol,
      side: editing.side,
      account,
      entryDate: `${entryDate}T12:00:00.000Z`,
      exitDate: editing.exitDate,
      entryPrice: editing.entryPrice,
      exitPrice: editing.exitPrice,
      pnl: editing.pnl,
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
            收藏成功交易的 K 线模板，每日复习，保持纪律不变形
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowPicker(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
          >
            <TrendingUp className="h-4 w-4" />
            从盈利交易添加
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

      <div className="rounded-xl border border-violet-100 bg-gradient-to-r from-violet-50 to-brand-50 p-4 text-sm text-slate-700">
        <p className="font-medium text-slate-900">使用 TradingView 链接，保存后即可预览</p>
        <p className="mt-1 text-slate-600">
          快照链接（<code className="text-xs">/x/...</code>）会自动显示截图预览；
          布局链接（<code className="text-xs">/chart/...</code>）可内嵌交互式 K 线。
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
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
          <ArrowDownUp className="ml-1.5 h-3.5 w-3.5 text-slate-400" />
          <button
            type="button"
            onClick={() => setSort('newest')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              dateSort === 'newest' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            最新优先
          </button>
          <button
            type="button"
            onClick={() => setSort('oldest')}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              dateSort === 'oldest' ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            最旧优先
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Sparkles className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-medium text-slate-700">还没有收藏的经典交易</p>
          <p className="mt-1 text-sm text-slate-500">从盈利交易一键添加，或手动创建多周期图鉴</p>
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
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">选择盈利交易</h2>
              <button onClick={() => setShowPicker(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>
            {winningCandidates.length === 0 ? (
              <p className="text-sm text-slate-500">当前账户下暂无已平仓盈利交易</p>
            ) : (
              <div className="space-y-2">
                {winningCandidates.map((trade) => (
                  <button
                    key={trade.id}
                    type="button"
                    onClick={() => handlePickTrade(trade.id)}
                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-violet-300 hover:bg-violet-50/50"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{trade.symbol}</p>
                      <p className="text-xs text-slate-500">
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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">
                {editing.id ? '编辑案例' : '新建案例'}
              </h2>
              <button onClick={closeEditor} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            {(editing.tradeId || editing.entryPrice > 0) && (
              <div className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {form.symbol || editing.symbol} · {form.entryDate || editing.entryDate.slice(0, 10)} · {editing.side === 'long' ? '做多' : '做空'}
                {editing.entryPrice > 0 && <> @ ${editing.entryPrice.toFixed(2)}</>}
                {editing.pnl != null && <span className="ml-2">盈亏 {formatCurrency(editing.pnl)}</span>}
              </div>
            )}

            <div className="space-y-4">
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
              <Field label="案例名称" hint="选填；留空时卡片标题使用交易品种">
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="如：漂亮的 MB1/MB2"
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
              <Field label="入场逻辑（为何是好交易）">
                <textarea
                  value={form.thesis}
                  onChange={(e) => setForm((f) => ({ ...f, thesis: e.target.value }))}
                  rows={3}
                  placeholder="大周期趋势、关键位、量价配合…"
                  className="form-input resize-none"
                />
              </Field>
              <Field label="心得 / 可复制的纪律">
                <textarea
                  value={form.lessons}
                  onChange={(e) => setForm((f) => ({ ...f, lessons: e.target.value }))}
                  rows={2}
                  placeholder="下次遇到类似 setup 要怎么做…"
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
                <p className="mb-2 text-sm font-medium text-slate-700">
                  EVC 图表链接 <span className="text-red-500">*</span>
                </p>
                <p className="mb-3 text-xs text-slate-500">
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
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveError}
              </div>
            )}

            {editing.journalDate && (
              <Link
                to={`/journal?date=${editing.journalDate}`}
                onClick={closeEditor}
                className="mt-4 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
              >
                <BookOpen className="h-4 w-4" />
                关联日记：{editing.journalDate}
              </Link>
            )}

            <div className="mt-6 flex gap-3">
              <button onClick={closeEditor} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
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

  return (
    <article
      className={cn(
        'flex flex-col rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md',
        entry.pinned ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
      )}
    >
      <div className="border-b border-slate-100 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-slate-900">{entry.title}</h3>
              {entry.pinned && (
                <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  置顶
                </span>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              {!titleLooksLikeSymbol && (
                <>
                  <span className="font-semibold text-slate-800">{entry.symbol}</span>
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
                'rounded-lg p-1.5 hover:bg-amber-50',
                entry.pinned ? 'text-amber-500' : 'text-slate-400 hover:text-amber-500'
              )}
              title={entry.pinned ? '取消置顶' : '置顶'}
            >
              <Star className={cn('h-4 w-4', entry.pinned && 'fill-current')} />
            </button>
            <button onClick={onEdit} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600" title="编辑">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={onDelete} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500" title="删除">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        {entry.setup && <p className="mt-2 text-xs font-medium text-violet-700">{entry.setup}</p>}
        {entry.thesis && <p className="mt-2 line-clamp-2 text-xs text-slate-600">{entry.thesis}</p>}
      </div>

      <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        {PLAYBOOK_TIMEFRAMES.map((tf) => {
          const chart = entry.charts.find((c) => c.timeframe === tf && c.url.trim())
          if (!chart?.url) {
            return (
              <div
                key={tf}
                className="flex min-h-[9rem] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-center"
              >
                <span className="text-xs font-bold text-slate-500">{tf}</span>
                <span className="mt-0.5 text-[10px] text-slate-400">{PLAYBOOK_SLOT_LABELS[tf]}</span>
              </div>
            )
          }
          return <ChartEmbed key={tf} url={chart.url} timeframe={tf} compact />
        })}
      </div>

      <div className="mt-auto flex items-center justify-between border-t border-slate-100 px-4 py-3">
        <span className="text-xs text-slate-400">{chartCount} 个图表链接</span>
        {entry.journalDate && (
          <Link
            to={`/journal?date=${entry.journalDate}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
          >
            <BookOpen className="h-3 w-3" />
            当日日记
          </Link>
        )}
      </div>
    </article>
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
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {hint && <p className="mb-1.5 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  )
}
