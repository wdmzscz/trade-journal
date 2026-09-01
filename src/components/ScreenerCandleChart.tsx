import { useMemo, useState } from 'react'
import { emaSeries, type Bar } from '../lib/momentumScan'
import type { ResolvedTheme } from '../hooks/useTheme'
import { cn } from '../utils/cn'

type Props = {
  bars: Bar[]
  theme: ResolvedTheme
  maxBars?: number
  stage1Len?: number
  spikeBars?: number
  showEma20?: boolean
}

function fmtPrice(n: number): string {
  if (n >= 1000) return n.toFixed(1)
  if (n >= 10) return n.toFixed(2)
  return n.toFixed(3)
}

function fmtTime(ts: number): string {
  const d = new Date(ts * 1000)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${m}-${day}`
}

export function ScreenerCandleChart({
  bars,
  theme,
  maxBars = 80,
  stage1Len,
  spikeBars = 1,
  showEma20 = false,
}: Props) {
  const start = bars.length > maxBars ? bars.length - maxBars : 0
  const slice = bars.slice(start)
  const [hover, setHover] = useState<number | null>(null)

  const ema20 = useMemo(() => {
    if (!showEma20) return []
    return emaSeries(bars.map((b) => b.close), 20).slice(start)
  }, [bars, showEma20, start])

  const spikeN = Math.min(3, Math.max(1, Math.round(spikeBars) || 1))
  const resistLen = stage1Len ? Math.min(stage1Len, Math.max(0, slice.length - spikeN)) : 0
  const resistance = useMemo(() => {
    if (resistLen < 2) return null
    const window = slice.slice(-(resistLen + spikeN), spikeN > 0 ? -spikeN : undefined)
    if (window.length === 0) return null
    return window.reduce((max, bar) => Math.max(max, bar.high), -Infinity)
  }, [slice, resistLen, spikeN])

  const layout = useMemo(() => {
    if (slice.length === 0) return null
    const highs = slice.map((b) => b.high)
    const lows = slice.map((b) => b.low)
    const vols = slice.map((b) => b.volume)
    const emaVals = ema20.filter((n): n is number => n != null)
    const minP = Math.min(...lows, ...(emaVals.length ? emaVals : []))
    const maxP = Math.max(...highs, ...(emaVals.length ? emaVals : []))
    const maxV = Math.max(...vols, 1)
    const pad = (maxP - minP) * 0.06 || maxP * 0.01
    return { minP: minP - pad, maxP: maxP + pad, maxV }
  }, [slice, ema20])

  if (!layout) {
    return <p className="px-4 py-8 text-sm text-slate-500">没有K线数据</p>
  }

  const W = 800
  const H = 360
  const left = 8
  const right = 56
  const top = 12
  const mid = 248
  const bot = 16
  const plotW = W - left - right
  const priceH = mid - top
  const volH = H - mid - bot - 8
  const step = plotW / slice.length
  const bodyW = Math.max(2, step * 0.62)
  const dark = theme === 'dark'
  const up = dark ? '#34d399' : '#059669'
  const down = dark ? '#f87171' : '#dc2626'
  const grid = dark ? '#334155' : '#e2e8f0'
  const axis = dark ? '#94a3b8' : '#64748b'
  const spike = dark ? '#38bdf8' : '#0284c7'
  const emaColor = dark ? '#fbbf24' : '#d97706'
  const resistColor = dark ? '#a78bfa' : '#7c3aed'
  const zone = dark ? 'rgba(167, 139, 250, 0.12)' : 'rgba(124, 58, 237, 0.08)'
  const { minP, maxP, maxV } = layout

  function yPrice(p: number): number {
    return top + ((maxP - p) / (maxP - minP || 1)) * priceH
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => minP + (maxP - minP) * t)
  const active = hover != null ? slice[hover] : slice[slice.length - 1]
  const lastTwo = new Set([slice.length - 1, slice.length - 2])
  const s1From = resistLen >= 2 ? slice.length - resistLen - spikeN : null
  const emaPath = ema20
    .map((v, i) => {
      if (v == null) return null
      const x = left + i * step + step / 2
      return `${x},${yPrice(v)}`
    })
    .filter(Boolean)
    .join(' ')

  return (
    <div className="relative">
      {active && (
        <div className="absolute left-3 top-2 z-10 rounded-md bg-white/90 px-2 py-1 text-[11px] tabular-nums text-slate-600 shadow-sm dark:bg-surface-900/90 dark:text-slate-300">
          {fmtTime(active.time)} · O {fmtPrice(active.open)} H {fmtPrice(active.high)} L {fmtPrice(active.low)} C {fmtPrice(active.close)}
        </div>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((p) => (
          <g key={p}>
            <line x1={left} x2={W - right} y1={yPrice(p)} y2={yPrice(p)} stroke={grid} strokeWidth={1} />
            <text x={W - right + 6} y={yPrice(p) + 4} fill={axis} fontSize={10}>{fmtPrice(p)}</text>
          </g>
        ))}
        <line x1={left} x2={W - right} y1={mid} y2={mid} stroke={grid} strokeWidth={1} />

        {s1From != null && s1From >= 0 && (
          <rect
            x={left + s1From * step}
            y={top}
            width={resistLen * step}
            height={priceH}
            fill={zone}
          />
        )}

        {resistance != null && Number.isFinite(resistance) && (
          <line
            x1={left}
            x2={W - right}
            y1={yPrice(resistance)}
            y2={yPrice(resistance)}
            stroke={resistColor}
            strokeWidth={1.2}
            strokeDasharray="5 4"
          />
        )}

        {emaPath && (
          <polyline
            points={emaPath}
            fill="none"
            stroke={emaColor}
            strokeWidth={1.4}
          />
        )}

        {slice.map((bar, i) => {
          const x = left + i * step + step / 2
          const bull = bar.close >= bar.open
          const inStage1 = s1From != null && i >= s1From && i < slice.length - spikeN
          const isBreak = stage1Len != null && i >= slice.length - spikeN
          const color = isBreak ? resistColor : lastTwo.has(i) ? spike : inStage1 ? (dark ? '#c4b5fd' : '#7c3aed') : bull ? up : down
          const yHigh = yPrice(bar.high)
          const yLow = yPrice(bar.low)
          const yO = yPrice(bar.open)
          const yC = yPrice(bar.close)
          const bodyTop = Math.min(yO, yC)
          const bodyH = Math.max(1.2, Math.abs(yC - yO))
          const vH = (bar.volume / maxV) * volH
          return (
            <g
              key={`${bar.time}-${i}`}
              onMouseEnter={() => setHover(i)}
              className="cursor-crosshair"
            >
              <rect x={left + i * step} y={top} width={step} height={H - top - bot} fill="transparent" />
              <line x1={x} x2={x} y1={yHigh} y2={yLow} stroke={color} strokeWidth={1.2} />
              <rect
                x={x - bodyW / 2}
                y={bodyTop}
                width={bodyW}
                height={bodyH}
                fill={color}
              />
              <rect
                x={x - bodyW / 2}
                y={H - bot - vH}
                width={bodyW}
                height={vH}
                fill={color}
                opacity={lastTwo.has(i) || isBreak ? 0.9 : 0.45}
              />
            </g>
          )
        })}
      </svg>
      <p className={cn('px-3 pb-2 text-[11px]', dark ? 'text-slate-500' : 'text-slate-400')}>
        蓝柱是最近成交量。
        {stage1Len ? ` 紫色区是 Stage1，最近 ${spikeN} 根是放量突破，虚线是阻力。` : ''}
        {showEma20 ? ' 黄线是 EMA20。' : ''}
      </p>
    </div>
  )
}
