import { useState } from 'react'
import { ExternalLink, LineChart } from 'lucide-react'
import {
  getChartPreviewImageUrl,
  isTradingViewSnapshotUrl,
  toTradingViewEmbedUrl,
  tradingViewHost,
} from '../utils/chartLinks'
import { PLAYBOOK_SLOT_LABELS } from '../types'
import { cn } from '../utils/cn'

type ChartEmbedProps = {
  url: string
  timeframe: string
  compact?: boolean
  className?: string
}

function slotHeading(timeframe: string): string {
  const label = PLAYBOOK_SLOT_LABELS[timeframe as keyof typeof PLAYBOOK_SLOT_LABELS]
  return label ? `${timeframe} · ${label}` : timeframe
}

function ChartOpenCard({
  url,
  timeframe,
  compact,
  className,
}: ChartEmbedProps) {
  const isSnapshot = isTradingViewSnapshotUrl(url)
  const isTv = tradingViewHost(url)

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-b from-slate-800 to-slate-900 text-center transition-all hover:border-brand-400 hover:shadow-md',
        compact ? 'min-h-[9rem]' : 'min-h-[11rem]',
        className
      )}
    >
      <div className="flex items-center justify-between px-2 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
          {slotHeading(timeframe)}
        </span>
        <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-white" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center px-3 pb-3">
        <div className="rounded-full bg-slate-700/80 p-3 group-hover:bg-brand-600/80">
          <LineChart className="h-6 w-6 text-slate-300 group-hover:text-white" />
        </div>
        <p className="mt-2 text-xs font-medium text-slate-200">
          {isSnapshot ? 'TradingView 快照' : isTv ? 'TradingView 图表' : '打开图表'}
        </p>
        <p className="mt-1 text-[10px] text-slate-400 group-hover:text-slate-300">
          {isSnapshot ? '预览加载失败，点击新标签页查看' : '点击新标签页查看'}
        </p>
      </div>
    </a>
  )
}

function ChartImagePreview({ url, timeframe, compact, className }: ChartEmbedProps) {
  const imageUrl = getChartPreviewImageUrl(url)
  const [imageFailed, setImageFailed] = useState(false)

  if (!imageUrl || imageFailed) {
    return (
      <ChartOpenCard
        url={url}
        timeframe={timeframe}
        compact={compact}
        className={className}
      />
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block overflow-hidden rounded-lg border border-slate-200 bg-slate-900 transition-all hover:border-brand-400 hover:shadow-md',
        className
      )}
    >
      <div className="flex items-center justify-between bg-slate-800 px-2 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
          {slotHeading(timeframe)}
        </span>
        <ExternalLink className="h-3 w-3 text-slate-500 group-hover:text-white" />
      </div>
      <img
        src={imageUrl}
        alt={`${slotHeading(timeframe)} chart`}
        className={cn(
          'w-full bg-slate-950 object-cover object-top',
          compact ? 'h-36' : 'h-44 sm:h-52'
        )}
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
      />
    </a>
  )
}

export function ChartEmbed({ url, timeframe, compact, className }: ChartEmbedProps) {
  const embedUrl = toTradingViewEmbedUrl(url)
  const previewImageUrl = getChartPreviewImageUrl(url)
  const [iframeFailed, setIframeFailed] = useState(false)

  if (previewImageUrl) {
    return (
      <ChartImagePreview
        url={url}
        timeframe={timeframe}
        compact={compact}
        className={className}
      />
    )
  }

  if (!embedUrl || iframeFailed) {
    return (
      <ChartOpenCard
        url={url}
        timeframe={timeframe}
        compact={compact}
        className={className}
      />
    )
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-slate-200 bg-slate-900', className)}>
      <div className="flex items-center justify-between bg-slate-800 px-2 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
          {slotHeading(timeframe)}
        </span>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-white"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <iframe
        src={embedUrl}
        title={`${timeframe} chart`}
        className={cn('w-full border-0 bg-white', compact ? 'h-36' : 'h-44 sm:h-52')}
        loading="lazy"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        referrerPolicy="no-referrer-when-downgrade"
        onError={() => setIframeFailed(true)}
      />
    </div>
  )
}
