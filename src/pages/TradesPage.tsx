import { useMemo, useState } from 'react'
import { Search, Trash2, Download } from 'lucide-react'
import { useTradeStore } from '../hooks/useTradeStore'
import { PnlBadge } from '../components/PnlBadge'
import { filterTrades } from '../utils/stats'
import { exportTradesToCsv } from '../utils/csvImport'
import type { TradeSide, TradeStatus } from '../types'

export function TradesPage() {
  const { trades, deleteTrade, accounts } = useTradeStore()
  const [search, setSearch] = useState('')
  const [symbol, setSymbol] = useState('all')
  const [side, setSide] = useState<TradeSide | 'all'>('all')
  const [status, setStatus] = useState<TradeStatus | 'all'>('all')
  const [account, setAccount] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))].sort(), [trades])

  const filtered = useMemo(
    () => filterTrades(trades, { search, symbol, side, status, account, dateFrom, dateTo })
      .sort((a, b) => b.entryDate.localeCompare(a.entryDate)),
    [trades, search, symbol, side, status, account, dateFrom, dateTo]
  )

  const totalPnl = filtered.filter((t) => t.status === 'closed').reduce((s, t) => s + t.pnl, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trades</h1>
          <p className="mt-1 text-sm text-slate-500">
            {filtered.length} 笔交易 · 筛选盈亏 <PnlBadge value={totalPnl} className="ml-1" />
          </p>
        </div>
        <button
          onClick={() => exportTradesToCsv(filtered)}
          className="flex items-center gap-2 rounded-lg border border-surface-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Download className="h-4 w-4" />
          导出 CSV
        </button>
      </div>

      <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="搜索标的、策略、标签..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <Select value={symbol} onChange={setSymbol} options={[{ value: 'all', label: '全部标的' }, ...symbols.map((s) => ({ value: s, label: s }))]} />
          <Select value={side} onChange={(v) => setSide(v as TradeSide | 'all')} options={[{ value: 'all', label: '全部方向' }, { value: 'long', label: '做多' }, { value: 'short', label: '做空' }]} />
          <Select value={status} onChange={(v) => setStatus(v as TradeStatus | 'all')} options={[{ value: 'all', label: '全部状态' }, { value: 'closed', label: '已平仓' }, { value: 'open', label: '持仓中' }]} />
          <Select value={account} onChange={setAccount} options={[{ value: 'all', label: '全部账户' }, ...accounts.map((a) => ({ value: a, label: a }))]} />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-slate-500">
                <th className="px-4 py-3 font-medium">入场日期</th>
                <th className="px-4 py-3 font-medium">标的</th>
                <th className="px-4 py-3 font-medium">方向</th>
                <th className="px-4 py-3 font-medium">入场价</th>
                <th className="px-4 py-3 font-medium">出场价</th>
                <th className="px-4 py-3 font-medium">数量</th>
                <th className="px-4 py-3 font-medium">策略</th>
                <th className="px-4 py-3 font-medium">标签</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 text-right font-medium">盈亏</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-slate-400">
                    暂无交易记录
                  </td>
                </tr>
              ) : (
                filtered.map((trade) => (
                  <tr key={trade.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-600">{trade.entryDate.slice(0, 10)}</td>
                    <td className="px-4 py-3 font-semibold text-slate-900">{trade.symbol}</td>
                    <td className="px-4 py-3">
                      <span className={trade.side === 'long' ? 'text-emerald-600' : 'text-red-500'}>
                        {trade.side === 'long' ? '做多' : '做空'}
                      </span>
                    </td>
                    <td className="px-4 py-3">${trade.entryPrice.toFixed(2)}</td>
                    <td className="px-4 py-3">{trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}</td>
                    <td className="px-4 py-3">{trade.quantity}</td>
                    <td className="px-4 py-3 text-slate-600">{trade.setup ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {trade.tags.map((tag) => (
                          <span key={tag} className="rounded bg-brand-50 px-1.5 py-0.5 text-xs text-brand-700">{tag}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${trade.status === 'closed' ? 'bg-slate-100 text-slate-600' : 'bg-amber-50 text-amber-700'}`}>
                        {trade.status === 'closed' ? '已平仓' : '持仓中'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trade.status === 'closed' ? <PnlBadge value={trade.pnl} /> : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { if (confirm('确定删除这笔交易？')) deleteTrade(trade.id) }}
                        className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
