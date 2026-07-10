import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, BookOpen, Sparkles } from 'lucide-react'
import type { Trade } from '../types'
import { ChartLinkFields } from './ChartLinkFields'
import { normalizeChartLinks } from '../utils/chartLinks'
import { formatCurrency } from '../utils/stats'

type TradeEntryChartModalProps = {
  trade: Trade
  onClose: () => void
  onSave: (entryCharts: Trade['entryCharts']) => void
  onAddToPlaybook?: () => void
  inPlaybook?: boolean
}

export function TradeEntryChartModal({
  trade,
  onClose,
  onSave,
  onAddToPlaybook,
  inPlaybook,
}: TradeEntryChartModalProps) {
  const [charts, setCharts] = useState(trade.entryCharts?.length ? trade.entryCharts : [{ timeframe: '入场', url: '' }])

  useEffect(() => {
    setCharts(trade.entryCharts?.length ? trade.entryCharts : [{ timeframe: '入场', url: '' }])
  }, [trade])

  const journalDate = trade.entryDate.slice(0, 10)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">入场图 · {trade.symbol}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {journalDate} · {trade.side === 'long' ? '做多' : '做空'} @ ${trade.entryPrice.toFixed(2)}
              {trade.status === 'closed' && (
                <span className="ml-2 font-medium text-slate-700">盈亏 {formatCurrency(trade.pnl)}</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
          建议粘贴 TradingView 图表链接（分享 → Copy link），只存文字 URL，比截图省空间，也方便随时打开复盘。
        </p>

        <ChartLinkFields charts={charts} onChange={setCharts} />

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={`/journal?date=${journalDate}`}
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <BookOpen className="h-3.5 w-3.5" />
            查看当日日记
          </Link>
          {onAddToPlaybook && trade.status === 'closed' && trade.pnl > 0 && (
            <button
              type="button"
              onClick={onAddToPlaybook}
              disabled={inPlaybook}
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {inPlaybook ? '已在图鉴中' : '加入交易图鉴'}
            </button>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            取消
          </button>
          <button
            onClick={() => {
              onSave(normalizeChartLinks(charts))
              onClose()
            }}
            className="flex-1 rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
