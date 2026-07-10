import type { ChartLink } from '../types'
import { PLAYBOOK_TIMEFRAMES } from '../types'

export function isValidChartUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeChartLinks(charts: ChartLink[] | undefined): ChartLink[] {
  if (!charts?.length) return []
  return charts
    .map((chart) => ({
      timeframe: chart.timeframe.trim(),
      url: chart.url.trim(),
      note: chart.note?.trim() || undefined,
    }))
    .filter((chart) => chart.timeframe && isValidChartUrl(chart.url))
}

export function countValidCharts(charts: ChartLink[] | undefined): number {
  return normalizeChartLinks(charts).length
}

export function getPrimaryChartUrl(charts: ChartLink[] | undefined): string | undefined {
  return normalizeChartLinks(charts)[0]?.url
}

export function validatePlaybookCharts(charts: ChartLink[]): { valid: ChartLink[]; error?: string } {
  const valid = normalizeChartLinks(charts)
  const hasInput = charts.some((chart) => chart.url.trim())
  const hasInvalid = charts.some((chart) => chart.url.trim() && !isValidChartUrl(chart.url))

  if (valid.length > 0) {
    return { valid }
  }
  if (hasInvalid) {
    return { valid, error: 'EVC 链接格式无效，请使用完整的 http:// 或 https:// 地址' }
  }
  if (hasInput) {
    return { valid, error: '请检查 EVC 链接是否填写正确' }
  }
  return { valid, error: '请至少填写 E、V、C 中任意一个 TradingView 链接' }
}

const LEGACY_PLAYBOOK_MAP: Record<string, (typeof PLAYBOOK_TIMEFRAMES)[number]> = {
  '1m': 'E',
  '5m': 'V',
  '1h': 'C',
}

function normalizePlaybookTimeframe(timeframe: string): string {
  return LEGACY_PLAYBOOK_MAP[timeframe] ?? timeframe
}

export function mergePlaybookChartSlots(charts?: ChartLink[]): ChartLink[] {
  const slots = emptyPlaybookChartSlots()
  const existing = new Map(
    (charts ?? []).map((chart) => [normalizePlaybookTimeframe(chart.timeframe), chart])
  )
  return slots.map((slot) => {
    const match = existing.get(slot.timeframe)
    return match ? { ...slot, url: match.url, note: match.note } : slot
  })
}

export function emptyPlaybookChartSlots(): ChartLink[] {
  return PLAYBOOK_TIMEFRAMES.map((timeframe) => ({ timeframe, url: '' }))
}

export function tradingViewHost(url: string): boolean {
  try {
    return new URL(url).hostname.includes('tradingview.com')
  } catch {
    return false
  }
}

export function isTradingViewSnapshotUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    return tradingViewHost(url) && /\/x\/[^/]+/i.test(parsed.pathname)
  } catch {
    return false
  }
}

/** 从 /x/{id}/ 快照页提取 ID */
export function extractTradingViewSnapshotId(url: string): string | null {
  try {
    const parsed = new URL(url.trim())
    if (!tradingViewHost(url)) return null
    const match = parsed.pathname.match(/\/x\/([a-zA-Z0-9]+)/i)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

/** 快照链接对应的 CDN 图片（可直接 <img> 预览） */
export function toTradingViewSnapshotImageUrl(url: string): string | null {
  const id = extractTradingViewSnapshotId(url)
  if (!id) return null
  const folder = id.charAt(0).toLowerCase()
  return `https://s3.tradingview.com/snapshots/${folder}/${id}.png`
}

export function isDirectImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim())
    const path = parsed.pathname.toLowerCase()
    return (
      /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(path) ||
      parsed.hostname.includes('s3.tradingview.com')
    )
  } catch {
    return false
  }
}

/** 卡片内静态预览图：快照 /x/ → S3，或直接图片链接 */
export function getChartPreviewImageUrl(url: string): string | null {
  const trimmed = url.trim()
  if (isDirectImageUrl(trimmed)) return trimmed
  return toTradingViewSnapshotImageUrl(trimmed)
}

/** 是否可在页面内 iframe 嵌入（仅 layout 链接 /chart/，快照 /x/ 不行） */
export function canEmbedTradingView(url: string): boolean {
  if (!isValidChartUrl(url) || !tradingViewHost(url)) return false
  if (isTradingViewSnapshotUrl(url)) return false
  try {
    return new URL(url.trim()).pathname.includes('/chart/')
  } catch {
    return false
  }
}

/** 将可嵌入的 TradingView layout 链接转为 embed 模式 */
export function toTradingViewEmbedUrl(url: string): string | null {
  const trimmed = url.trim()
  if (!canEmbedTradingView(trimmed)) return null
  try {
    const parsed = new URL(trimmed)
    parsed.searchParams.set('embed', '1')
    return parsed.toString()
  } catch {
    return null
  }
}
