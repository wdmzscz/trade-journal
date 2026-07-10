import { ExternalLink } from 'lucide-react'
import type { ChartLink } from '../types'
import { PLAYBOOK_SLOT_LABELS } from '../types'
import { canEmbedTradingView, isTradingViewSnapshotUrl, isValidChartUrl, tradingViewHost } from '../utils/chartLinks'
import { cn } from '../utils/cn'

function slotHeading(timeframe: string): string {
  const label = PLAYBOOK_SLOT_LABELS[timeframe as keyof typeof PLAYBOOK_SLOT_LABELS]
  return label ? `${timeframe} · ${label}` : timeframe
}

type ChartLinkFieldsProps = {
  charts: ChartLink[]
  onChange: (charts: ChartLink[]) => void
  timeframes?: string[]
  compact?: boolean
  showValidation?: boolean
}

export function ChartLinkFields({ charts, onChange, timeframes, compact, showValidation }: ChartLinkFieldsProps) {
  const slots = timeframes
    ? timeframes.map((timeframe) => {
        const existing = charts.find((chart) => chart.timeframe === timeframe)
        return existing ?? { timeframe, url: '' }
      })
    : charts

  const updateSlot = (index: number, patch: Partial<ChartLink>) => {
    const next = [...slots]
    next[index] = { ...next[index], ...patch }
    onChange(next)
  }

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {slots.map((chart, index) => {
        const valid = isValidChartUrl(chart.url)
        const hasInput = Boolean(chart.url.trim())
        const invalid = showValidation && hasInput && !valid
        return (
          <div
            key={`${chart.timeframe}-${index}`}
            className={cn(
              'rounded-xl border p-3',
              invalid && 'border-red-300 bg-red-50/50',
              !invalid && valid && 'border-emerald-200 bg-emerald-50/40',
              !invalid && !valid && 'border-slate-200 bg-slate-50/50'
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="rounded-md bg-white px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-700 shadow-sm">
                {slotHeading(chart.timeframe)}
              </span>
              {valid && (
                <a
                  href={chart.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  预览
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <input
              type="url"
              value={chart.url}
              onChange={(e) => updateSlot(index, { url: e.target.value })}
              placeholder="粘贴 TradingView 图表链接（推荐）"
              className="form-input text-sm"
            />
            {!compact && (
              <input
                type="text"
                value={chart.note ?? ''}
                onChange={(e) => updateSlot(index, { note: e.target.value })}
                placeholder="备注：关键位、入场理由…"
                className="form-input mt-2 text-sm"
              />
            )}
            {chart.url && !valid && (
              <p className="mt-1.5 text-xs text-red-600">链接格式无效，请使用 http:// 或 https:// 开头的完整地址</p>
            )}
            {valid && tradingViewHost(chart.url) && (
              <p className="mt-1.5 text-xs text-emerald-700">
                {isTradingViewSnapshotUrl(chart.url)
                  ? '快照链接 · 保存后自动显示截图预览'
                  : canEmbedTradingView(chart.url)
                    ? 'Layout 链接 · 可在 Playbook 内嵌交互预览'
                    : 'TradingView 链接 · 仅保存 URL'}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
