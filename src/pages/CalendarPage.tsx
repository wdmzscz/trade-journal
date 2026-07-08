import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns'
import { zhCN } from 'date-fns/locale'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { ChevronLeft, ChevronRight, StickyNote, CalendarDays } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { StatCard } from '../components/StatCard'
import { PnlBadge } from '../components/PnlBadge'
import { AccountScopeBanner } from '../components/AccountScopeBanner'
import {
  computeDailyPnl,
  computeCumulativePnl,
  computeCalendarStats,
  buildMonthWeeks,
  buildMiniMonthDays,
  getDayResult,
  dayResultBgClass,
  dayResultColor,
  formatCurrency,
  formatPercent,
} from '../utils/stats'
import type { DayResult } from '../types'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const MONTHS = Array.from({ length: 12 }, (_, i) => i)

export function CalendarPage() {
  const { filteredTrades, filteredJournal } = useTradeStore()
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const dailyPnl = useMemo(() => computeDailyPnl(filteredTrades), [filteredTrades])
  const pnlMap = useMemo(() => new Map(dailyPnl.map((d) => [d.date, d])), [dailyPnl])
  const journalDates = useMemo(() => new Set(filteredJournal.map((j) => j.date)), [filteredJournal])

  const monthDate = useMemo(() => new Date(selectedYear, selectedMonth, 1), [selectedYear, selectedMonth])
  const monthFrom = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const monthTo = format(endOfMonth(monthDate), 'yyyy-MM-dd')
  const yearFrom = `${selectedYear}-01-01`
  const yearTo = `${selectedYear}-12-31`

  const monthStats = useMemo(
    () => computeCalendarStats(filteredTrades, filteredJournal, dailyPnl, monthFrom, monthTo),
    [filteredTrades, filteredJournal, dailyPnl, monthFrom, monthTo]
  )
  const yearStats = useMemo(
    () => computeCalendarStats(filteredTrades, filteredJournal, dailyPnl, yearFrom, yearTo),
    [filteredTrades, filteredJournal, dailyPnl, yearFrom, yearTo]
  )

  const monthDaily = useMemo(
    () => dailyPnl.filter((d) => d.date >= monthFrom && d.date <= monthTo),
    [dailyPnl, monthFrom, monthTo]
  )
  const monthCumulative = useMemo(() => computeCumulativePnl(monthDaily), [monthDaily])
  const monthWeeks = useMemo(() => buildMonthWeeks(monthDate, pnlMap), [monthDate, pnlMap])

  const monthTrades = useMemo(
    () =>
      filteredTrades.filter(
        (t) =>
          t.status === 'closed' &&
          t.exitDate &&
          t.exitDate.slice(0, 10) >= monthFrom &&
          t.exitDate.slice(0, 10) <= monthTo
      ),
    [filteredTrades, monthFrom, monthTo]
  )

  const selectedDayTrades = useMemo(() => {
    if (!selectedDate) return []
    return filteredTrades.filter(
      (t) =>
        t.entryDate.slice(0, 10) === selectedDate ||
        (t.exitDate && t.exitDate.slice(0, 10) === selectedDate)
    )
  }, [filteredTrades, selectedDate])

  const evaluationData = [
    { name: '盈利', value: monthStats.winningTrades, color: '#22c55e' },
    { name: '亏损', value: monthStats.losingTrades, color: '#ef4444' },
    { name: '持平', value: monthStats.breakEvenTrades, color: '#94a3b8' },
  ].filter((d) => d.value > 0)

  const selectMonth = (monthIndex: number) => {
    setSelectedMonth(monthIndex)
    setSelectedDate(null)
  }

  return (
    <div className="space-y-6">
      <AccountScopeBanner />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Calendar</h1>
          <p className="page-subtitle">年历与月历视图，追踪每日盈亏与交易表现</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-3 py-2 shadow-sm">
          <button
            onClick={() => setSelectedYear((y) => y - 1)}
            className="rounded p-1 hover:bg-slate-100"
            aria-label="上一年"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[4rem] text-center font-semibold text-slate-900">{selectedYear}</span>
          <button
            onClick={() => setSelectedYear((y) => y + 1)}
            className="rounded p-1 hover:bg-slate-100"
            aria-label="下一年"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Year summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="年度总盈亏"
          value={formatCurrency(yearStats.totalPnl)}
          trend={yearStats.totalPnl >= 0 ? 'up' : 'down'}
          subtitle={`${yearStats.totalTradingDays} 个交易日`}
          icon={<CalendarDays className="h-5 w-5" />}
        />
        <StatCard
          title="盈利天数"
          value={String(yearStats.winningDays)}
          trend="up"
          subtitle={`亏损 ${yearStats.losingDays} 天 · 持平 ${yearStats.breakevenDays} 天`}
        />
        <StatCard
          title="年度胜率"
          value={formatPercent(yearStats.winRate)}
          trend={yearStats.winRate >= 50 ? 'up' : 'down'}
          subtitle={`${yearStats.winningTrades}W / ${yearStats.losingTrades}L`}
        />
        <StatCard
          title="日记记录"
          value={String(yearStats.loggedDays)}
          trend="neutral"
          subtitle="已记录日记的天数"
        />
      </div>

      {/* Year Calendar */}
      <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">年度日历</h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-500" /> 盈利日
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-red-500" /> 亏损日
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-slate-400" /> 持平日
            </span>
            <span className="flex items-center gap-1.5">
              <StickyNote className="h-3 w-3 text-brand-500" /> 有日记
            </span>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {MONTHS.map((monthIndex) => {
            const miniMonth = new Date(selectedYear, monthIndex, 1)
            const days = buildMiniMonthDays(miniMonth)
            const firstDayOffset = new Date(selectedYear, monthIndex, 1).getDay()
            const isActive = monthIndex === selectedMonth

            return (
              <button
                key={monthIndex}
                onClick={() => selectMonth(monthIndex)}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  isActive ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <p className="mb-2 text-xs font-semibold text-slate-700">
                  {format(miniMonth, 'M月', { locale: zhCN })}
                </p>
                <div className="mb-1 grid grid-cols-7 gap-0.5">
                  {WEEKDAYS.map((d) => (
                    <div key={d} className="text-center text-[8px] text-slate-400">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-0.5">
                  {Array.from({ length: firstDayOffset }).map((_, i) => (
                    <div key={`pad-${i}`} className="aspect-square" />
                  ))}
                  {days.map((dateStr) => {
                    const pnl = pnlMap.get(dateStr)?.pnl
                    const result = getDayResult(pnl)
                    const hasJournal = journalDates.has(dateStr)
                    return (
                      <div
                        key={dateStr}
                        className="relative aspect-square rounded-sm"
                        style={{ backgroundColor: result !== 'none' ? dayResultColor(result) : undefined }}
                        title={pnl !== undefined ? `${dateStr}: ${formatCurrency(pnl)}` : dateStr}
                      >
                        {hasJournal && (
                          <span className="absolute bottom-0 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-white" />
                        )}
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Monthly View */}
      <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (selectedMonth === 0) {
                  setSelectedYear((y) => y - 1)
                  setSelectedMonth(11)
                } else {
                  setSelectedMonth((m) => m - 1)
                }
                setSelectedDate(null)
              }}
              className="rounded p-1 hover:bg-slate-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold text-slate-900">
              {format(monthDate, 'yyyy年 M月', { locale: zhCN })}
            </h2>
            <button
              onClick={() => {
                if (selectedMonth === 11) {
                  setSelectedYear((y) => y + 1)
                  setSelectedMonth(0)
                } else {
                  setSelectedMonth((m) => m + 1)
                }
                setSelectedDate(null)
              }}
              className="rounded p-1 hover:bg-slate-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">月度总盈亏</p>
            <PnlBadge value={monthStats.totalPnl} className="text-lg font-bold" />
          </div>
        </div>

        <div className="mb-2 grid grid-cols-8 gap-1 text-center text-xs font-medium text-slate-400">
          {WEEKDAYS.map((d) => (
            <div key={d}>{d}</div>
          ))}
          <div>周合计</div>
        </div>

        <div className="space-y-1">
          {monthWeeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-8 gap-1">
              {week.days.map((dateStr, di) => {
                if (!dateStr) {
                  return <div key={`empty-${wi}-${di}`} className="min-h-[4.5rem]" />
                }
                const pnl = pnlMap.get(dateStr)
                const result = getDayResult(pnl?.pnl)
                const isSelected = selectedDate === dateStr
                const hasJournal = journalDates.has(dateStr)

                return (
                  <DayCell
                    key={dateStr}
                    dateStr={dateStr}
                    dayNum={parseISO(dateStr).getDate()}
                    pnl={pnl?.pnl}
                    trades={pnl?.trades}
                    result={result}
                    isSelected={isSelected}
                    hasJournal={hasJournal}
                    onClick={() => setSelectedDate(dateStr)}
                  />
                )
              })}
              <div className="flex min-h-[4.5rem] flex-col items-center justify-center rounded-lg bg-slate-50 px-1 text-center">
                {week.weekTrades > 0 ? (
                  <>
                    <span className={`text-xs font-semibold ${week.weekPnl >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {week.weekPnl >= 0 ? '+' : ''}{week.weekPnl.toFixed(0)}
                    </span>
                    <span className="text-[10px] text-slate-400">{week.weekTrades} 笔</span>
                  </>
                ) : (
                  <span className="text-[10px] text-slate-300">—</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-900">
                {format(parseISO(selectedDate), 'yyyy年 M月 d日 EEEE', { locale: zhCN })}
              </h3>
              <p className="text-sm text-slate-500">{selectedDayTrades.length} 笔交易</p>
            </div>
            <div className="flex items-center gap-3">
              {pnlMap.get(selectedDate) && <PnlBadge value={pnlMap.get(selectedDate)!.pnl} />}
              {journalDates.has(selectedDate) && (
                <Link
                  to="/journal"
                  className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-brand-600 shadow-sm hover:bg-brand-50"
                >
                  <StickyNote className="h-3.5 w-3.5" />
                  查看日记
                </Link>
              )}
            </div>
          </div>
          {selectedDayTrades.length > 0 && (
            <div className="mt-3 space-y-2">
              {selectedDayTrades.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                  <span className="font-medium">
                    {t.symbol} · {t.side === 'long' ? '做多' : '做空'}
                  </span>
                  {t.status === 'closed' ? <PnlBadge value={t.pnl} /> : (
                    <span className="text-xs text-amber-600">持仓中</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cumulative P&L + Overall Evaluation */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="每日累计盈亏 (Daily Net Cumulative P&L)">
          {monthCumulative.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthCumulative}>
                <defs>
                  <linearGradient id="calPnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(8)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), '']} />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#7c3aed"
                  fill="url(#calPnlGradient)"
                  strokeWidth={2}
                  name="累计盈亏"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="本月暂无交易数据" />
          )}
        </ChartCard>

        <ChartCard title="月度综合评估 (Overall Evaluation)">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col items-center justify-center">
              {evaluationData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={evaluationData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={3}
                    >
                      {evaluationData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="暂无交易" />
              )}
            </div>
            <div className="space-y-3">
              <EvalRow label="胜率" value={formatPercent(monthStats.winRate)} />
              <EvalRow label="盈利交易" value={String(monthStats.winningTrades)} positive />
              <EvalRow label="亏损交易" value={String(monthStats.losingTrades)} negative />
              <EvalRow label="持平交易" value={String(monthStats.breakEvenTrades)} />
              <EvalRow label="盈亏比" value={monthStats.profitFactor >= 999 ? '∞' : monthStats.profitFactor.toFixed(2)} />
              <EvalRow label="期望值" value={formatCurrency(monthStats.expectancy)} />
            </div>
          </div>
        </ChartCard>
      </div>

      {/* Statistics */}
      <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">
          统计数据 — {format(monthDate, 'yyyy年 M月', { locale: zhCN })}
        </h2>
        <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatRow label="总盈亏 (Total P&L)" value={formatCurrency(monthStats.totalPnl)} />
          <StatRow label="总交易数" value={String(monthStats.totalTrades)} />
          <StatRow label="盈利交易数" value={String(monthStats.winningTrades)} />
          <StatRow label="亏损交易数" value={String(monthStats.losingTrades)} />
          <StatRow label="持平交易数" value={String(monthStats.breakEvenTrades)} />
          <StatRow label="平均盈利交易" value={formatCurrency(monthStats.avgWin)} />
          <StatRow label="平均亏损交易" value={formatCurrency(-monthStats.avgLoss)} />
          <StatRow label="平均交易盈亏" value={formatCurrency(monthStats.avgTradePnl)} />
          <StatRow label="最大单笔盈利" value={formatCurrency(monthStats.largestWin)} />
          <StatRow label="最大单笔亏损" value={formatCurrency(monthStats.largestLoss)} />
          <StatRow label="盈亏比 (Profit Factor)" value={monthStats.profitFactor >= 999 ? '∞' : monthStats.profitFactor.toFixed(2)} />
          <StatRow label="期望值 (Expectancy)" value={formatCurrency(monthStats.expectancy)} />
          <StatRow label="总手续费" value={formatCurrency(monthStats.totalFees)} />
          <StatRow label="持仓中交易" value={String(monthStats.openTrades)} />
          <StatRow label="总交易日" value={String(monthStats.totalTradingDays)} />
          <StatRow label="盈利天数" value={String(monthStats.winningDays)} />
          <StatRow label="亏损天数" value={String(monthStats.losingDays)} />
          <StatRow label="持平天数" value={String(monthStats.breakevenDays)} />
          <StatRow label="日记记录天数" value={String(monthStats.loggedDays)} />
          <StatRow label="最大连续盈利" value={String(monthStats.maxConsecutiveWins)} />
          <StatRow label="最大连续亏损" value={String(monthStats.maxConsecutiveLosses)} />
          <StatRow label="最大连续盈利日" value={String(monthStats.maxConsecutiveWinningDays)} />
          <StatRow label="最大连续亏损日" value={String(monthStats.maxConsecutiveLosingDays)} />
          <StatRow label="平均每日盈亏" value={formatCurrency(monthStats.avgDailyPnl)} />
          <StatRow label="平均盈利日盈亏" value={formatCurrency(monthStats.avgWinningDayPnl)} />
          <StatRow label="平均亏损日盈亏" value={formatCurrency(monthStats.avgLosingDayPnl)} />
          <StatRow label="最大盈利日" value={formatCurrency(monthStats.largestProfitableDay)} />
          <StatRow label="最大亏损日" value={formatCurrency(monthStats.largestLosingDay)} />
        </div>
      </div>

      {/* Month trades list */}
      {monthTrades.length > 0 && (
        <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">本月交易明细</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">平仓日期</th>
                  <th className="pb-2 font-medium">标的</th>
                  <th className="pb-2 font-medium">方向</th>
                  <th className="pb-2 font-medium">策略</th>
                  <th className="pb-2 text-right font-medium">盈亏</th>
                </tr>
              </thead>
              <tbody>
                {monthTrades.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2.5 text-slate-600">{t.exitDate?.slice(0, 10)}</td>
                    <td className="py-2.5 font-semibold">{t.symbol}</td>
                    <td className="py-2.5">
                      <span className={t.side === 'long' ? 'text-emerald-600' : 'text-red-500'}>
                        {t.side === 'long' ? '做多' : '做空'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">{t.setup ?? '-'}</td>
                    <td className="py-2.5 text-right"><PnlBadge value={t.pnl} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function DayCell({
  dayNum,
  pnl,
  trades,
  result,
  isSelected,
  hasJournal,
  onClick,
}: {
  dateStr: string
  dayNum: number
  pnl?: number
  trades?: number
  result: DayResult
  isSelected: boolean
  hasJournal: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex min-h-[4.5rem] flex-col items-center rounded-lg p-1.5 text-xs transition-colors ${dayResultBgClass(result, isSelected)}`}
    >
      <span className="font-semibold">{dayNum}</span>
      {pnl !== undefined && (
        <span className={`mt-0.5 text-[10px] font-medium ${isSelected ? 'text-white' : ''}`}>
          {pnl >= 0 ? '+' : ''}{pnl.toFixed(0)}
        </span>
      )}
      {trades !== undefined && trades > 0 && (
        <span className={`text-[9px] ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
          {trades} 笔
        </span>
      )}
      {hasJournal && (
        <StickyNote className={`absolute right-1 top-1 h-2.5 w-2.5 ${isSelected ? 'text-white' : 'text-brand-500'}`} />
      )}
    </button>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  )
}

function EmptyChart({ message = '暂无数据' }: { message?: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-slate-400">{message}</div>
  )
}

function EvalRow({
  label,
  value,
  positive,
  negative,
}: {
  label: string
  value: string
  positive?: boolean
  negative?: boolean
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span
        className={`font-semibold ${
          positive ? 'text-emerald-600' : negative ? 'text-red-500' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  )
}
