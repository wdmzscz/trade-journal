import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Plus, Trash2, Copy, FlaskConical, Info,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend,
  Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { BacktestProvider, useBacktestStore } from '../hooks/useBacktestStore'
import { useTheme } from '../hooks/useTheme'
import { cn } from '../utils/cn'
import { formatCurrency } from '../utils/stats'
import {
  classifyBacktestOutcome,
  computeBacktestEquity,
  computeBacktestOverview,
  computeRByDayOfWeek,
  computeRByHour,
  computeRByMonth,
  formatR,
} from '../utils/backtestStats'
import type { BacktestTrade } from '../types/backtest'

type Tab = 'log' | 'overview' | 'curves' | 'breakdown'

export function BacktestPage() {
  return (
    <BacktestProvider>
      <BacktestPageInner />
    </BacktestProvider>
  )
}

function BacktestPageInner() {
  const { ready, settings, trades, updateSettings, addTrade, updateTrade, deleteTrade, duplicateTrade } =
    useBacktestStore()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [tab, setTab] = useState<Tab>('log')

  const overview = useMemo(() => computeBacktestOverview(trades, settings), [trades, settings])
  const equity = useMemo(() => computeBacktestEquity(trades, settings), [trades, settings])
  const byDow = useMemo(() => computeRByDayOfWeek(trades, settings), [trades, settings])
  const byMonth = useMemo(() => computeRByMonth(trades, settings), [trades, settings])
  const byHour = useMemo(() => computeRByHour(trades, settings), [trades, settings])

  const chartGrid = isDark ? '#334155' : '#e2e8f0'
  const chartTick = isDark ? '#94a3b8' : '#64748b'
  const tooltipStyle = {
    backgroundColor: isDark ? '#0f172a' : '#fff',
    borderColor: isDark ? '#334155' : '#e2e8f0',
    borderRadius: 8,
  }

  const donut = [
    { name: 'Win', value: overview.wins, color: '#22c55e' },
    { name: 'BE', value: overview.breakevens, color: '#94a3b8' },
    { name: 'Loss', value: overview.losses, color: '#ef4444' },
  ].filter((d) => d.value > 0)

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-brand-500" />
            <h1 className="page-title">Backtesting</h1>
          </div>
          <p className="page-subtitle mt-1">
            Mock trading / 历史回测专用。数据与实盘、IBKR Sync 完全隔离，互不影响。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            addTrade()
            setTab('log')
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          添加交易
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            请勿把回测数据当作实盘记录。列顺序与字段会影响统计：勾选「计入分析」的交易才会进入胜率、曲线与账户走向。
            BE 规则：RR Secured 落在 [{settings.beMinR}, {settings.beMaxR}] R 区间内视为 BE。
          </p>
        </div>
      </div>

      {/* Settings */}
      <section className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">回测参数</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SettingField label="起始资金 ($)">
            <input
              type="number"
              className="form-input"
              value={settings.startingBalance}
              onChange={(e) => updateSettings({ startingBalance: Number(e.target.value) || 0 })}
            />
          </SettingField>
          <SettingField label="每笔风险 (%)">
            <input
              type="number"
              step="0.1"
              className="form-input"
              value={settings.riskPercent}
              onChange={(e) => updateSettings({ riskPercent: Number(e.target.value) || 0 })}
            />
          </SettingField>
          <SettingField label="BE 下限 (R)">
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={settings.beMinR}
              onChange={(e) => updateSettings({ beMinR: Number(e.target.value) })}
            />
          </SettingField>
          <SettingField label="BE 上限 (R)">
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={settings.beMaxR}
              onChange={(e) => updateSettings({ beMaxR: Number(e.target.value) })}
            />
          </SettingField>
          <SettingField label="每笔成本 (R)">
            <input
              type="number"
              step="0.01"
              className="form-input"
              value={settings.costPerTradeR}
              onChange={(e) => updateSettings({ costPerTradeR: Number(e.target.value) || 0 })}
            />
          </SettingField>
        </div>
      </section>

      {/* Tabs */}
      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-surface-700 dark:bg-surface-900">
        {(
          [
            ['log', '交易日志'],
            ['overview', '总览'],
            ['curves', '账户曲线'],
            ['breakdown', '时段拆解'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:text-sm',
              tab === id
                ? 'bg-brand-600 text-white'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-surface-800'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'log' && (
        <TradeLogTable
          trades={trades}
          onChange={updateTrade}
          onDelete={deleteTrade}
          onDuplicate={duplicateTrade}
          onAdd={addTrade}
          settingsBe={{ beMinR: settings.beMinR, beMaxR: settings.beMaxR, costPerTradeR: settings.costPerTradeR }}
        />
      )}

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="交易数" value={String(overview.totalTrades)} hint={`${overview.wins}W · ${overview.breakevens}BE · ${overview.losses}L`} />
            <MetricCard
              label="胜率 (不含 BE)"
              value={`${overview.winRate.toFixed(1)}%`}
              hint={`BE ${overview.beRate.toFixed(1)}% · Loss ${overview.lossRate.toFixed(1)}%`}
              positive={overview.winRate >= 50}
            />
            <MetricCard label="累计 R" value={formatR(overview.totalR)} positive={overview.totalR >= 0} />
            <MetricCard
              label="期望值 EV"
              value={formatR(overview.expectancyR)}
              hint={`PF ${overview.profitFactor >= 999 ? '∞' : overview.profitFactor.toFixed(2)}`}
              positive={overview.expectancyR >= 0}
            />
            <MetricCard label="平均盈利 R" value={formatR(overview.avgWinR)} positive />
            <MetricCard label="平均亏损 R" value={formatR(-overview.avgLossR)} positive={false} />
            <MetricCard
              label="最大回撤"
              value={`${overview.maxDrawdownR.toFixed(2)}R`}
              hint={`${overview.maxDrawdownPctCompounded.toFixed(2)}% (复利)`}
              positive={false}
            />
            <MetricCard
              label="最大触及 RR"
              value={overview.maxRrReached ? formatR(overview.maxRrReached) : '—'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">账户结果</h3>
              <div className="mt-3 space-y-2 text-sm">
                <Row label="起始资金" value={formatCurrency(overview.startingBalance)} />
                <Row
                  label="复利余额"
                  value={`${formatCurrency(overview.compoundedBalance)} (${overview.compoundedRoi.toFixed(2)}%)`}
                  positive={overview.compoundedRoi >= 0}
                />
                <Row
                  label="非复利余额"
                  value={`${formatCurrency(overview.uncompoundedBalance)} (${overview.uncompoundedRoi.toFixed(2)}%)`}
                  positive={overview.uncompoundedRoi >= 0}
                />
                <Row
                  label="平均交易间隔"
                  value={
                    overview.avgDaysBetweenTrades != null
                      ? `${overview.avgDaysBetweenTrades.toFixed(1)} 天`
                      : '—'
                  }
                />
                <Row label="每笔风险" value={`${settings.riskPercent.toFixed(2)}%`} />
              </div>
            </div>

            <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">结果分布</h3>
              {donut.length === 0 ? (
                <p className="mt-8 text-center text-sm text-slate-500">暂无计入分析的交易</p>
              ) : (
                <div className="mx-auto h-56 w-full max-w-xs">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                        {donut.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'curves' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="R curve（累计 R）">
            {equity.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={equity}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="index" tick={{ fill: chartTick, fontSize: 11 }} />
                  <YAxis tick={{ fill: chartTick, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area type="monotone" dataKey="cumulativeR" name="R secured" stroke="#38bdf8" fill="#38bdf8" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard title="Profit curve（复利 vs 非复利）">
            {equity.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={equity}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="index" tick={{ fill: chartTick, fontSize: 11 }} />
                  <YAxis tick={{ fill: chartTick, fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="compoundedBalance" name="Compounded" stroke="#94a3b8" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="uncompoundedBalance" name="Uncompounded" stroke="#38bdf8" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}

      {tab === 'breakdown' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <BucketChart
            title="按星期"
            data={byDow}
            chartGrid={chartGrid}
            chartTick={chartTick}
            tooltipStyle={tooltipStyle}
          />
          <BucketChart
            title="按月份"
            data={byMonth}
            chartGrid={chartGrid}
            chartTick={chartTick}
            tooltipStyle={tooltipStyle}
          />
          <ChartCard title="按入场小时 (有填写时间的交易)">
            {byHour.length === 0 ? (
              <EmptyChart hint="在日志中填写 Time 后显示" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byHour.map((h) => ({ label: `${String(h.hour).padStart(2, '0')}:00`, r: h.r, trades: h.trades }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
                  <XAxis dataKey="label" tick={{ fill: chartTick, fontSize: 10 }} />
                  <YAxis tick={{ fill: chartTick, fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="r" name="Total R">
                    {byHour.map((h) => (
                      <Cell key={h.hour} fill={h.r >= 0 ? '#22c55e' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      )}
    </div>
  )
}

function TradeLogTable({
  trades,
  onChange,
  onDelete,
  onDuplicate,
  onAdd,
  settingsBe,
}: {
  trades: BacktestTrade[]
  onChange: (id: string, patch: Partial<BacktestTrade>) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onAdd: () => void
  settingsBe: { beMinR: number; beMaxR: number; costPerTradeR: number }
}) {
  const sorted = useMemo(
    () =>
      [...trades].sort((a, b) => {
        const cmp = `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`)
        return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt)
      }),
    [trades]
  )

  return (
    <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <div className="overflow-x-auto">
        <table className="min-w-[1100px] w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-sky-50 text-[10px] uppercase tracking-wide text-sky-800 dark:border-surface-700 dark:bg-sky-950/40 dark:text-sky-200">
              <th colSpan={6} className="px-3 py-2 font-semibold">
                Super important
              </th>
              <th colSpan={2} className="px-3 py-2 font-semibold">
                Optional
              </th>
              <th colSpan={4} className="bg-violet-50 px-3 py-2 font-semibold text-violet-800 dark:bg-violet-950/40 dark:text-violet-200">
                Screenshots / links
              </th>
              <th className="bg-rose-50 px-3 py-2 font-semibold text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                Notes
              </th>
              <th className="px-3 py-2" />
            </tr>
            <tr className="border-b border-slate-200 text-[11px] text-slate-500 dark:border-surface-700 dark:text-slate-400">
              <th className="px-2 py-2">计入</th>
              <th className="px-2 py-2">Symbol</th>
              <th className="px-2 py-2">Date</th>
              <th className="px-2 py-2">Time</th>
              <th className="px-2 py-2">Stop Loss ($)</th>
              <th className="px-2 py-2">RR Secured</th>
              <th className="px-2 py-2">Duration</th>
              <th className="px-2 py-2">Max RR</th>
              <th className="px-2 py-2">Context</th>
              <th className="px-2 py-2">V</th>
              <th className="px-2 py-2">s-micro</th>
              <th className="px-2 py-2">Entry</th>
              <th className="px-2 py-2">Notes</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={14} className="px-4 py-12 text-center text-sm text-slate-500">
                  还没有回测交易。点击「添加交易」开始记录。
                </td>
              </tr>
            ) : (
              sorted.map((trade) => {
                const outcome = classifyBacktestOutcome(trade.rrSecured, {
                  startingBalance: 0,
                  riskPercent: 0,
                  beMinR: settingsBe.beMinR,
                  beMaxR: settingsBe.beMaxR,
                  costPerTradeR: settingsBe.costPerTradeR,
                })
                return (
                  <tr
                    key={trade.id}
                    className={cn(
                      'border-b border-slate-100 dark:border-surface-800',
                      !trade.includeInAnalysis && 'opacity-50'
                    )}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={trade.includeInAnalysis}
                        onChange={(e) => onChange(trade.id, { includeInAnalysis: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="form-input min-w-[4.5rem] px-2 py-1.5 uppercase"
                        value={trade.symbol}
                        onChange={(e) => onChange(trade.id, { symbol: e.target.value })}
                        placeholder="MGC"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        className="form-input min-w-[8.5rem] px-2 py-1.5"
                        value={trade.date}
                        onChange={(e) => onChange(trade.id, { date: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="time"
                        className="form-input min-w-[6.5rem] px-2 py-1.5"
                        value={trade.time || ''}
                        onChange={(e) => onChange(trade.id, { time: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        className="form-input w-24 px-2 py-1.5"
                        value={trade.stopLoss ?? ''}
                        placeholder="auto"
                        onChange={(e) =>
                          onChange(trade.id, {
                            stopLoss: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          className="form-input w-20 px-2 py-1.5"
                          value={trade.rrSecured}
                          onChange={(e) => onChange(trade.id, { rrSecured: Number(e.target.value) })}
                        />
                        <OutcomeChip outcome={outcome} />
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        className="form-input w-16 px-2 py-1.5"
                        value={trade.durationCandles ?? ''}
                        onChange={(e) =>
                          onChange(trade.id, {
                            durationCandles: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        step="0.01"
                        className="form-input w-16 px-2 py-1.5"
                        value={trade.maxRr ?? ''}
                        onChange={(e) =>
                          onChange(trade.id, {
                            maxRr: e.target.value === '' ? undefined : Number(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="form-input min-w-[7rem] px-2 py-1.5"
                        value={trade.chartContext || ''}
                        placeholder="TV link"
                        onChange={(e) => onChange(trade.id, { chartContext: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="form-input min-w-[7rem] px-2 py-1.5"
                        value={trade.chartV || ''}
                        onChange={(e) => onChange(trade.id, { chartV: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="form-input min-w-[7rem] px-2 py-1.5"
                        value={trade.chartSMicro || ''}
                        onChange={(e) => onChange(trade.id, { chartSMicro: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="form-input min-w-[7rem] px-2 py-1.5"
                        value={trade.chartEntry || ''}
                        onChange={(e) => onChange(trade.id, { chartEntry: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        className="form-input min-w-[10rem] px-2 py-1.5"
                        value={trade.notes || ''}
                        onChange={(e) => onChange(trade.id, { notes: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          title="复制"
                          onClick={() => onDuplicate(trade.id)}
                          className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-surface-800"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="删除"
                          onClick={() => {
                            if (confirm('删除这笔回测交易？')) onDelete(trade.id)
                          }}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="border-t border-slate-100 px-3 py-2 dark:border-surface-800">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
        >
          <Plus className="h-3.5 w-3.5" />
          添加一行
        </button>
      </div>
    </div>
  )
}

function OutcomeChip({ outcome }: { outcome: 'win' | 'loss' | 'breakeven' }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded px-1 py-0.5 text-[9px] font-bold',
        outcome === 'win' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
        outcome === 'loss' && 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
        outcome === 'breakeven' && 'bg-slate-100 text-slate-600 dark:bg-surface-800 dark:text-slate-300'
      )}
    >
      {outcome === 'win' ? 'W' : outcome === 'loss' ? 'L' : 'BE'}
    </span>
  )
}

function SettingField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="mb-1 block font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  )
}

function MetricCard({
  label,
  value,
  hint,
  positive,
}: {
  label: string
  value: string
  hint?: string
  positive?: boolean
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={cn(
          'mt-1 text-xl font-bold tabular-nums',
          positive === true && 'text-emerald-600 dark:text-emerald-400',
          positive === false && 'text-red-500 dark:text-red-400',
          positive == null && 'text-slate-900 dark:text-slate-100'
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

function Row({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={cn(
          'font-medium tabular-nums',
          positive === true && 'text-emerald-600 dark:text-emerald-400',
          positive === false && 'text-red-500 dark:text-red-400',
          positive == null && 'text-slate-800 dark:text-slate-200'
        )}
      >
        {value}
      </span>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
      {children}
    </div>
  )
}

function EmptyChart({ hint }: { hint?: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
      {hint ?? '暂无数据'}
    </div>
  )
}

function BucketChart({
  title,
  data,
  chartGrid,
  chartTick,
  tooltipStyle,
}: {
  title: string
  data: { label: string; r: number; trades: number }[]
  chartGrid: string
  chartTick: string
  tooltipStyle: CSSProperties
}) {
  return (
    <ChartCard title={title}>
      <div className="mb-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 text-left font-medium">项</th>
              <th className="py-1 text-right font-medium">R</th>
              <th className="py-1 text-right font-medium">Trades</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.label} className="border-t border-slate-100 dark:border-surface-800">
                <td className="py-1 text-slate-700 dark:text-slate-300">{row.label}</td>
                <td className={cn('py-1 text-right tabular-nums', row.r >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                  {row.r.toFixed(2)}
                </td>
                <td className="py-1 text-right text-slate-500">{row.trades}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} />
          <XAxis dataKey="label" tick={{ fill: chartTick, fontSize: 10 }} />
          <YAxis tick={{ fill: chartTick, fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="r" name="Total R">
            {data.map((d) => (
              <Cell key={d.label} fill={d.r >= 0 ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  )
}
