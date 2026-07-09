import { useMemo } from 'react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  DollarSign, TrendingUp, Target, BarChart3, Percent, Activity,
} from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { StatCard } from '../components/StatCard'
import { PnlBadge } from '../components/PnlBadge'
import { AccountScopeBanner } from '../components/AccountScopeBanner'
import {
  computeDashboardStats, computeDailyPnl, computeCumulativePnl,
  computeSymbolStats, computeSetupStats, computeWinLossDistribution,
  computeDayOfWeekStats, formatCurrency, formatPercent, computeAccountReturn,
} from '../utils/stats'

export function DashboardPage() {
  const { filteredTrades, selectedAccount, selectedAccountInfo, accountInfos } = useTradeStore()

  const stats = useMemo(() => computeDashboardStats(filteredTrades), [filteredTrades])
  const accountReturn = useMemo(() => {
    if (selectedAccount === 'all') {
      const returns = accountInfos
        .map((a) => computeAccountReturn(a.startingCapital, a.currentCapital))
        .filter((v): v is number => v != null)
      return returns.length > 0 ? returns.reduce((s, v) => s + v, 0) : null
    }
    return computeAccountReturn(
      selectedAccountInfo?.startingCapital,
      selectedAccountInfo?.currentCapital
    )
  }, [selectedAccount, selectedAccountInfo, accountInfos])
  const dailyPnl = useMemo(() => computeDailyPnl(filteredTrades), [filteredTrades])
  const cumulativePnl = useMemo(() => computeCumulativePnl(dailyPnl), [dailyPnl])
  const symbolStats = useMemo(() => computeSymbolStats(filteredTrades).slice(0, 8), [filteredTrades])
  const setupStats = useMemo(() => computeSetupStats(filteredTrades).slice(0, 6), [filteredTrades])
  const winLoss = useMemo(() => computeWinLossDistribution(filteredTrades), [filteredTrades])
  const dayOfWeek = useMemo(() => computeDayOfWeekStats(filteredTrades), [filteredTrades])

  const recentTrades = useMemo(
    () => [...filteredTrades].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 8),
    [filteredTrades]
  )

  return (
    <div className="space-y-6">
      <AccountScopeBanner />

      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">交易表现总览与数据分析</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {accountReturn != null && (
          <StatCard
            title="账户总盈亏"
            value={formatCurrency(accountReturn)}
            trend={accountReturn >= 0 ? 'up' : 'down'}
            subtitle="净资产 − 本金（与 IBKR 账户一致）"
            icon={<DollarSign className="h-5 w-5" />}
          />
        )}
        <StatCard
          title={accountReturn != null ? '交易盈亏合计' : '总盈亏 (P&L)'}
          value={formatCurrency(stats.totalPnl)}
          trend={stats.totalPnl >= 0 ? 'up' : 'down'}
          subtitle={
            accountReturn != null
              ? `${stats.closedTrades} 笔已平仓 · 不含利息/费用差额`
              : `${stats.closedTrades} 笔已平仓交易`
          }
          icon={<Activity className="h-5 w-5" />}
        />
        <StatCard
          title="胜率"
          value={formatPercent(stats.winRate)}
          trend={stats.winRate >= 50 ? 'up' : 'down'}
          subtitle={`${stats.winningTrades}W / ${stats.losingTrades}L`}
          icon={<Target className="h-5 w-5" />}
        />
        <StatCard
          title="盈亏比 (Profit Factor)"
          value={stats.profitFactor >= 999 ? '∞' : stats.profitFactor.toFixed(2)}
          trend={stats.profitFactor >= 1 ? 'up' : 'down'}
          subtitle={`平均盈利 ${formatCurrency(stats.avgWin)}`}
          icon={<TrendingUp className="h-5 w-5" />}
        />
        <StatCard
          title="期望值 (Expectancy)"
          value={formatCurrency(stats.expectancy)}
          trend={stats.expectancy >= 0 ? 'up' : 'down'}
          subtitle={`共 ${stats.totalTrades} 笔交易`}
          icon={<Activity className="h-5 w-5" />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="最大盈利" value={formatCurrency(stats.largestWin)} trend="up" icon={<BarChart3 className="h-5 w-5" />} />
        <StatCard title="最大亏损" value={formatCurrency(stats.largestLoss)} trend="down" />
        <StatCard title="平均亏损" value={formatCurrency(-stats.avgLoss)} trend="down" />
        <StatCard title="平均 R 倍数" value={stats.avgR.toFixed(2)} trend="neutral" icon={<Percent className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="累计盈亏曲线">
          {cumulativePnl.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={cumulativePnl}>
                <defs>
                  <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), '']} />
                <Area type="monotone" dataKey="cumulative" stroke="#7c3aed" fill="url(#pnlGradient)" strokeWidth={2} name="累计盈亏" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="每日盈亏">
          {dailyPnl.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={dailyPnl}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number) => [formatCurrency(v), '盈亏']} />
                <Bar dataKey="pnl" name="盈亏" radius={[4, 4, 0, 0]}>
                  {dailyPnl.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <ChartCard title="胜负分布">
          {winLoss.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={winLoss} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}>
                  {winLoss.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="按星期盈亏" className="lg:col-span-2">
          {dayOfWeek.some((d) => d.trades > 0) ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dayOfWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip formatter={(v: number, name: string) => [name === 'pnl' ? formatCurrency(v) : v, name === 'pnl' ? '盈亏' : '交易数']} />
                <Bar dataKey="pnl" name="盈亏" radius={[4, 4, 0, 0]}>
                  {dayOfWeek.map((entry, i) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? '#22c55e' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="按标的盈亏">
          {symbolStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 font-medium">标的</th>
                    <th className="pb-2 font-medium">交易数</th>
                    <th className="pb-2 font-medium">胜率</th>
                    <th className="pb-2 text-right font-medium">盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {symbolStats.map((s) => (
                    <tr key={s.symbol} className="border-b border-slate-100">
                      <td className="py-2.5 font-semibold text-slate-900">{s.symbol}</td>
                      <td className="py-2.5 text-slate-600">{s.trades}</td>
                      <td className="py-2.5 text-slate-600">{formatPercent(s.winRate)}</td>
                      <td className="py-2.5 text-right"><PnlBadge value={s.pnl} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>

        <ChartCard title="按策略 Setup">
          {setupStats.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 font-medium">策略</th>
                    <th className="pb-2 font-medium">交易数</th>
                    <th className="pb-2 font-medium">胜率</th>
                    <th className="pb-2 text-right font-medium">盈亏</th>
                  </tr>
                </thead>
                <tbody>
                  {setupStats.map((s) => (
                    <tr key={s.setup} className="border-b border-slate-100">
                      <td className="py-2.5 font-semibold text-slate-900">{s.setup}</td>
                      <td className="py-2.5 text-slate-600">{s.trades}</td>
                      <td className="py-2.5 text-slate-600">{formatPercent(s.winRate)}</td>
                      <td className="py-2.5 text-right"><PnlBadge value={s.pnl} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyChart />
          )}
        </ChartCard>
      </div>

      <ChartCard title="最近交易">
        {recentTrades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="pb-2 font-medium">日期</th>
                  <th className="pb-2 font-medium">标的</th>
                  <th className="pb-2 font-medium">方向</th>
                  <th className="pb-2 font-medium">策略</th>
                  <th className="pb-2 font-medium">状态</th>
                  <th className="pb-2 text-right font-medium">盈亏</th>
                </tr>
              </thead>
              <tbody>
                {recentTrades.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100">
                    <td className="py-2.5 text-slate-600">{t.entryDate.slice(0, 10)}</td>
                    <td className="py-2.5 font-semibold">{t.symbol}</td>
                    <td className="py-2.5">
                      <span className={t.side === 'long' ? 'text-emerald-600' : 'text-red-500'}>
                        {t.side === 'long' ? '做多' : '做空'}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">{t.setup ?? '-'}</td>
                    <td className="py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.status === 'closed' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                        {t.status === 'closed' ? '已平仓' : '持仓中'}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      {t.status === 'closed' ? <PnlBadge value={t.pnl} /> : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyChart message="暂无交易记录，请添加交易或导入 CSV" />
        )}
      </ChartCard>
    </div>
  )
}

function ChartCard({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-surface-200 bg-white p-5 shadow-sm ${className}`}>
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  )
}

function EmptyChart({ message = '暂无数据' }: { message?: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-slate-400">
      {message}
    </div>
  )
}
