import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, Download, ExternalLink, Filter, Loader2, Search, X } from 'lucide-react'
import {
  CHART_BAR_OPTIONS,
  DEFAULT_SCAN_SETTINGS,
  FINVIZ_RELVOL_URL,
  STRATEGIES,
  applyExtQuotes,
  assignStrategies,
  fetchNasdaq100,
  fetchSp500,
  fetchYahooBars,
  fetchYahooQuotes,
  finvizQuoteUrl,
  mapPool,
  marketBias,
  parseTickerList,
  returnOver,
  scoreSymbol,
  tradingViewUrl,
  tvWatchlistText,
  tvWidgetUrl,
  type Bar,
  type MbTarget,
  type ScanHit,
  type ScanMode,
  type ScanSettings,
  type ScanTimeframe,
  type Stage2Side,
  type StrategyId,
} from '../lib/momentumScan'
import { ScreenerCandleChart } from '../components/ScreenerCandleChart'
import { useTheme } from '../hooks/useTheme'
import { cn } from '../utils/cn'

type Universe = 'n100' | 'sp500' | 'custom'
type StrategyFilter = 'all' | StrategyId

const MODE_OPTIONS: { id: ScanMode; label: string; hint: string }[] = [
  { id: 'any', label: '任一', hint: '放量 50% 或安静后突发' },
  { id: 'volspike', label: 'VolSpike', hint: '比均量高 50%' },
  { id: 'quietspike', label: 'QuietSpike', hint: '前 30 根安静，最近突然放量' },
  { id: 'stage12', label: 'Stage1→2', hint: '两者都满足，最严' },
]

const STRATEGY_TONE: Record<StrategyId, string> = {
  s1break: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  mbflush: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  gap: 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  volume: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  rs: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  trend: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  adr: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  combo: 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
}

const STRATEGY_BORDER: Record<StrategyId, string> = {
  s1break: 'border-amber-400 dark:border-amber-500',
  mbflush: 'border-rose-400 dark:border-rose-500',
  gap: 'border-cyan-400 dark:border-cyan-500',
  volume: 'border-orange-400 dark:border-orange-500',
  rs: 'border-sky-400 dark:border-sky-500',
  trend: 'border-emerald-400 dark:border-emerald-500',
  adr: 'border-violet-400 dark:border-violet-500',
  combo: 'border-slate-900 dark:border-slate-100',
}

const ALL_ENABLED = Object.fromEntries(STRATEGIES.map((item) => [item.id, true])) as Record<StrategyId, boolean>

function fmtSigned(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

function hitDetail(hit: ScanHit): string {
  const parts: string[] = []
  if (hit.strategies.s1break) {
    parts.push(`S1 ${((hit.s1RangePct || 0) * 100).toFixed(1)}%波动`)
  }
  if (hit.strategies.mbflush) {
    const side = hit.s2Side === 'short' ? '空' : '多'
    parts.push(`MB${hit.mbBursts}${side} flush ${(hit.flushPct * 100).toFixed(1)}%`)
    parts.push(`EMA20 ${hit.ema20DistPct >= 0 ? '+' : ''}${hit.ema20DistPct.toFixed(1)}%`)
  }
  if (hit.strategies.gap) {
    const bits = [`缺口 ${fmtSigned(hit.gapPct)}`]
    if (hit.prePct != null) bits.push(`盘前 ${fmtSigned(hit.prePct)}`)
    if (hit.postPct != null) bits.push(`盘后 ${fmtSigned(hit.postPct)}`)
    parts.push(bits.join(' '))
  }
  return parts.join(' · ')
}

function patchNumber(
  patch: <K extends keyof ScanSettings>(key: K, value: ScanSettings[K]) => void,
  key: keyof ScanSettings,
  raw: string,
  min: number,
  max: number,
) {
  const n = Number(raw)
  if (!Number.isFinite(n)) return
  patch(key, Math.min(max, Math.max(min, n)) as ScanSettings[typeof key])
}

function strategyTags(hit: ScanHit, enabled?: Record<StrategyId, boolean>): StrategyId[] {
  return STRATEGIES.map((s) => s.id).filter((id) => hit.strategies[id] && (enabled ? enabled[id] : true))
}

export function ScreenerPage() {
  const [tf, setTf] = useState<ScanTimeframe>('1d')
  const [universe, setUniverse] = useState<Universe>('n100')
  const [customText, setCustomText] = useState('')
  const [settings, setSettings] = useState<ScanSettings>(DEFAULT_SCAN_SETTINGS)
  const [hits, setHits] = useState<ScanHit[]>([])
  const [strategyFilter, setStrategyFilter] = useState<StrategyFilter>('all')
  const [bias, setBias] = useState<'bull' | 'neutral' | 'bear' | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('还没扫。选好股票池后点开始扫描。')
  const [universeNote, setUniverseNote] = useState('选择指数后会拉取最新成分股')
  const [selected, setSelected] = useState<ScanHit | null>(null)
  const [chartTf, setChartTf] = useState<ScanTimeframe>('1d')
  const [chartBars, setChartBars] = useState<Bar[]>([])
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [chartBarsCount, setChartBarsCount] = useState(40)
  const [enabled, setEnabled] = useState<Record<StrategyId, boolean>>(ALL_ENABLED)
  const [exportNote, setExportNote] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const barCache = useRef(new Map<string, Bar[]>())
  const chartBoxRef = useRef<HTMLDivElement>(null)
  const { resolvedTheme } = useTheme()

  const enabledIds = useMemo(
    () => STRATEGIES.filter((item) => enabled[item.id]).map((item) => item.id),
    [enabled],
  )
  const customCount = useMemo(() => parseTickerList(customText).length, [customText])
  const visibleHits = useMemo(
    () => hits.filter((hit) => enabledIds.some((id) => hit.strategies[id])),
    [hits, enabledIds],
  )
  const filteredHits = useMemo(
    () => strategyFilter === 'all' ? visibleHits : visibleHits.filter((hit) => hit.strategies[strategyFilter]),
    [visibleHits, strategyFilter],
  )
  const strategyCounts = useMemo(() => {
    const counts = { all: visibleHits.length } as Record<StrategyFilter, number>
    for (const item of STRATEGIES) {
      counts[item.id] = visibleHits.filter((hit) => hit.strategies[item.id]).length
    }
    return counts
  }, [visibleHits])

  function patch<K extends keyof ScanSettings>(key: K, value: ScanSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  function toggleStrategy(id: StrategyId) {
    setEnabled((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      if (!Object.values(next).some(Boolean)) return prev
      return next
    })
    if (strategyFilter === id) setStrategyFilter('all')
  }

  async function resolveUniverse(signal: AbortSignal): Promise<string[]> {
    if (universe === 'custom') {
      const list = parseTickerList(customText)
      if (list.length === 0) throw new Error('请先粘贴股票代码，用空格或逗号分隔')
      return list
    }
    if (universe === 'sp500') return fetchSp500(signal)
    return fetchNasdaq100(signal)
  }

  useEffect(() => {
    if (universe === 'custom') {
      setUniverseNote('自定义名单，扫你粘贴的代码')
      return
    }
    const ac = new AbortController()
    setUniverseNote('正在拉取最新成分股…')
    const load = universe === 'sp500' ? fetchSp500 : fetchNasdaq100
    load(ac.signal)
      .then((list) => {
        setUniverseNote(`已加载最新成分股 ${list.length} 只`)
      })
      .catch((err) => {
        if (ac.signal.aborted) return
        setUniverseNote(err instanceof Error ? err.message : '成分股加载失败')
      })
    return () => ac.abort()
  }, [universe])

  async function runScan() {
    if (enabledIds.length === 0) {
      setError('至少选用一套策略')
      return
    }
    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)
    setError(null)
    setHits([])
    setSelected(null)
    setChartBars([])
    barCache.current.clear()
    setProgress({ done: 0, total: 0 })

    try {
      setStatus('正在拉取最新成分股…')
      const symbols = await resolveUniverse(ac.signal)
      setUniverseNote(`已加载最新成分股 ${symbols.length} 只`)
      setProgress({ done: 0, total: symbols.length })
      setStatus(`正在扫最新 ${symbols.length} 只，对比已选 ${enabledIds.length} 套策略…`)

      let spyRet20: number | null = null
      try {
        const spyBars = await fetchYahooBars('SPY', tf, ac.signal)
        spyRet20 = returnOver(spyBars.map((b) => b.close), 20)
        setBias(marketBias(spyBars))
      } catch {
        setBias(null)
      }

      const rows: NonNullable<ReturnType<typeof scoreSymbol>>[] = []
      let failed = 0
      await mapPool(symbols, 5, async (symbol) => {
        if (ac.signal.aborted) return
        try {
          const bars = await fetchYahooBars(symbol, tf, ac.signal)
          const row = scoreSymbol(symbol, bars, settings)
          if (row) {
            barCache.current.set(`${symbol}:${tf}`, bars)
            rows.push(row)
          }
        } catch {
          failed += 1
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }))
        }
      })

      if (ac.signal.aborted) return
      if (enabled.gap) {
        try {
          setStatus('正在拉盘前/盘后报价…')
          const quotes = await fetchYahooQuotes(rows.map((row) => row.symbol), ac.signal)
          applyExtQuotes(rows, quotes)
        } catch {
          /* 没有盘前盘后也不挡其他策略 */
        }
      }
      if (ac.signal.aborted) return
      const found = assignStrategies(rows, spyRet20, settings, enabledIds)
      setHits(found)
      setStrategyFilter('all')
      setStatus(
        failed
          ? `扫完 ${symbols.length} 只，已选 ${enabledIds.length} 套合计 ${found.length} 只，${failed} 只行情失败`
          : `扫完 ${symbols.length} 只，已选 ${enabledIds.length} 套合计 ${found.length} 只`,
      )
    } catch (err) {
      if (ac.signal.aborted) return
      const message = err instanceof Error ? err.message : '扫描失败'
      setError(
        /Failed to fetch|NetworkError|CORS/i.test(message)
          ? '浏览器拉不到行情。请用 npm run dev 打开本页再扫（开发服务器会代理 Yahoo）。'
          : message,
      )
      setStatus('扫描中断')
    } finally {
      if (abortRef.current === ac) setRunning(false)
    }
  }

  function stopScan() {
    abortRef.current?.abort()
    setRunning(false)
    setStatus('已停止')
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  function openHit(hit: ScanHit) {
    setSelected(hit)
    setChartTf(tf)
    setChartError(null)
    const cached = barCache.current.get(`${hit.symbol}:${tf}`)
    setChartBars(cached ?? [])
    requestAnimationFrame(() => {
      document.querySelector(`[data-symbol="${hit.symbol}"]`)?.scrollIntoView({ block: 'nearest' })
    })
  }

  function watchlistTitle(): string {
    const date = new Date().toISOString().slice(0, 10)
    const strat = strategyFilter === 'all'
      ? 'Momentum'
      : STRATEGIES.find((item) => item.id === strategyFilter)?.short ?? 'Momentum'
    return `${strat} ${date}`
  }

  function watchlistBody(): string {
    const exchange = universe === 'n100' ? 'NASDAQ' : undefined
    return tvWatchlistText(filteredHits.map((hit) => hit.symbol), watchlistTitle(), exchange)
  }

  function exportWatchlist() {
    if (filteredHits.length === 0) return
    const text = watchlistBody()
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${watchlistTitle().replace(/\s+/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setExportNote('已下载 txt。TradingView 关注列表 → 导入列表')
    window.setTimeout(() => setExportNote(null), 4000)
  }

  async function copyWatchlist() {
    if (filteredHits.length === 0) return
    try {
      await navigator.clipboard.writeText(watchlistBody())
      setExportNote('已复制。TradingView 关注列表 → 导入列表，或粘贴添加')
    } catch {
      setExportNote('复制失败，请用导出 txt')
    }
    window.setTimeout(() => setExportNote(null), 4000)
  }

  useEffect(() => {
    if (!selected) return
    const cached = barCache.current.get(`${selected.symbol}:${chartTf}`)
    if (cached) {
      setChartBars(cached)
      setChartError(null)
      return
    }
    const ac = new AbortController()
    setChartLoading(true)
    setChartError(null)
    fetchYahooBars(selected.symbol, chartTf, ac.signal)
      .then((bars) => {
        barCache.current.set(`${selected.symbol}:${chartTf}`, bars)
        setChartBars(bars)
      })
      .catch((err) => {
        if (ac.signal.aborted) return
        setChartBars([])
        setChartError(err instanceof Error ? err.message : 'K线加载失败')
      })
      .finally(() => {
        if (!ac.signal.aborted) setChartLoading(false)
      })
    return () => ac.abort()
  }, [selected, chartTf])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Momentum Screener</h1>
        <p className="page-subtitle">
          点上面的卡片选用或关掉策略。关掉的策略不扫，参数也不显示。
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STRATEGIES.map((item) => {
          const on = enabled[item.id]
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggleStrategy(item.id)}
              className={cn(
                'card-surface p-3 text-left transition',
                on ? `border-2 ${STRATEGY_BORDER[item.id]}` : 'border-2 border-transparent opacity-45 hover:opacity-70',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn('inline-flex rounded-md px-1.5 py-0.5 text-xs font-semibold', STRATEGY_TONE[item.id])}>
                  {item.short}
                </p>
                {on ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3 w-3" />
                    选用
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400">未选用</span>
                )}
              </div>
              <p className="mt-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{item.hint}</p>
            </button>
          )
        })}
      </div>

      <div className="card-surface p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">更大股票池</p>
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">
          Nasdaq-100 / S&P 500 是指数成分。要扫全美股龙头，先用 Finviz 粗筛再贴进自定义。
        </p>
        <a
          href={FINVIZ_RELVOL_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          打开 Finviz 放量粗筛
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="card-surface space-y-4 p-4 sm:p-5">
        <div className={cn('grid gap-4', enabled.volume ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500">周期</span>
            <select className="form-input" value={tf} onChange={(e) => setTf(e.target.value as ScanTimeframe)}>
              <option value="1h">1H</option>
              <option value="1d">1D（推荐）</option>
              <option value="1w">1W</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500">股票池</span>
            <select className="form-input" value={universe} onChange={(e) => setUniverse(e.target.value as Universe)}>
              <option value="n100">Nasdaq-100（每次拉最新）</option>
              <option value="sp500">S&P 500（每次拉最新）</option>
              <option value="custom">自定义粘贴</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">{universeNote}</p>
          </label>
          {enabled.volume && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">放量策略细则</span>
              <select className="form-input" value={settings.mode} onChange={(e) => patch('mode', e.target.value as ScanMode)}>
                {MODE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label} · {opt.hint}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {universe === 'custom' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              股票代码（{customCount}）
            </span>
            <textarea
              className="form-input min-h-[88px] font-mono"
              placeholder="AAPL NVDA TSLA META，或从 Finviz 复制"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
            />
          </label>
        )}

        {enabled.volume && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-600 dark:text-slate-400">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={settings.reqUpBar} onChange={(e) => patch('reqUpBar', e.target.checked)} />
              阳线
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={settings.reqHigherClose} onChange={(e) => patch('reqHigherClose', e.target.checked)} />
              收涨
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={settings.reqNearHigh} onChange={(e) => patch('reqNearHigh', e.target.checked)} />
              靠近 20 根高点
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={settings.reqAboveSma} onChange={(e) => patch('reqAboveSma', e.target.checked)} />
              站上 50 均
            </label>
          </div>
        )}

        {(enabled.s1break || enabled.mbflush || enabled.gap) && (
        <div className="grid gap-4 rounded-xl border border-slate-200 p-3 dark:border-surface-700 sm:grid-cols-2 xl:grid-cols-3">
          {enabled.s1break && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">写法 A · Stage1 突破</p>
            <p className="text-xs leading-5 text-slate-500">
              整理根数、波动上限都自己填。最近 1–3 根是放量突破蜡烛，要收过前面高点。
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">Stage1 根数</span>
              <input
                type="number"
                min={3}
                max={80}
                className="form-input"
                value={settings.stage1Len}
                onChange={(e) => patchNumber(patch, 'stage1Len', e.target.value, 3, 80)}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">振幅上限 %</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  step={0.5}
                  className="form-input"
                  value={settings.stage1RangeMax}
                  onChange={(e) => patchNumber(patch, 'stage1RangeMax', e.target.value, 1, 50)}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-slate-500">收盘方差上限 %</span>
                <input
                  type="number"
                  min={0.5}
                  max={20}
                  step={0.1}
                  className="form-input"
                  value={settings.stage1CvMax}
                  onChange={(e) => patchNumber(patch, 'stage1CvMax', e.target.value, 0.5, 20)}
                />
              </label>
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">放量突破蜡烛</span>
              <select
                className="form-input"
                value={settings.stage1SpikeBars}
                onChange={(e) => patch('stage1SpikeBars', Number(e.target.value))}
              >
                <option value={1}>最近 1 根</option>
                <option value={2}>最近 2 根</option>
                <option value={3}>最近 3 根</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">放量倍数（相对 Stage1 均量）</span>
              <input
                type="number"
                min={1}
                max={5}
                step={0.1}
                className="form-input"
                value={settings.stage1VolMult}
                onChange={(e) => patchNumber(patch, 'stage1VolMult', e.target.value, 1, 5)}
              />
            </label>
          </div>
          )}

          {enabled.mbflush && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-rose-700 dark:text-rose-300">写法 B · Stage2 MB flush</p>
            <p className="text-xs leading-5 text-slate-500">
              已经在 Stage2 上升或下降，数完 MB2 / MB3，正在 flush，准备在 EMA20 反弹。
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">动量爆发位置</span>
              <select
                className="form-input"
                value={settings.mbTarget}
                onChange={(e) => patch('mbTarget', e.target.value as MbTarget)}
              >
                <option value="2">只要 MB2</option>
                <option value="3">只要 MB3</option>
                <option value="2-3">MB2 或 MB3</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">趋势方向</span>
              <select
                className="form-input"
                value={settings.stage2Side}
                onChange={(e) => patch('stage2Side', e.target.value as Stage2Side)}
              >
                <option value="long">上升（回踩 EMA20 等反弹）</option>
                <option value="short">下降（反抽 EMA20 等回落）</option>
                <option value="both">上升或下降</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">贴近 EMA20</span>
              <select
                className="form-input"
                value={settings.ema20Band}
                onChange={(e) => patch('ema20Band', Number(e.target.value))}
              >
                <option value={1.5}>±1.5%</option>
                <option value={2.5}>±2.5%</option>
                <option value={4}>±4%</option>
              </select>
            </label>
          </div>
          )}

          {enabled.gap && (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-300">写法 C · 盘前盘后短线</p>
            <p className="text-xs leading-5 text-slate-500">
              和「放量」不完全重复：这里先要求还是动量股（趋势 / 靠近高点 / 站上 20 均），再看跳空、盘前或盘后大涨，或者当天也放量。适合找当天短线。
            </p>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">涨幅门槛 %（缺口/盘前/盘后）</span>
              <input
                type="number"
                min={0.5}
                max={20}
                step={0.5}
                className="form-input"
                value={settings.gapMinPct}
                onChange={(e) => patchNumber(patch, 'gapMinPct', e.target.value, 0.5, 20)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-slate-500">当天 RVOL 也算（需同时有一点缺口）</span>
              <input
                type="number"
                min={1}
                max={5}
                step={0.1}
                className="form-input"
                value={settings.gapRvol}
                onChange={(e) => patchNumber(patch, 'gapRvol', e.target.value, 1, 5)}
              />
            </label>
          </div>
          )}
        </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {running ? (
            <button
              type="button"
              onClick={stopScan}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-surface-700 dark:text-slate-200 dark:hover:bg-surface-800"
            >
              停止
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void runScan()}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Search className="h-4 w-4" />
              开始扫描
            </button>
          )}
          <span className="text-sm text-slate-500 dark:text-slate-400">{status}</span>
          {bias === 'bull' && <span className="text-xs font-medium text-emerald-600">SPY 偏多（站上 20/50）</span>}
          {bias === 'bear' && <span className="text-xs font-medium text-red-500">SPY 偏空（20/50 之下）</span>}
          {bias === 'neutral' && <span className="text-xs text-slate-500">SPY 中性</span>}
        </div>

        {running && (
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {progress.done} / {progress.total}
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-surface-800">
              <div className="h-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {error}
          </p>
        )}
      </div>

      <div
        className={cn(
          selected && filteredHits.length > 0 &&
            'grid gap-4 lg:sticky lg:top-3 lg:z-10 lg:h-[calc(100dvh-1.25rem)] lg:grid-cols-5 lg:items-stretch',
        )}
      >
        <div
          className={cn(
            'card-surface flex min-h-0 flex-col overflow-hidden',
            selected && 'order-2 max-h-[46vh] lg:order-1 lg:col-span-2 lg:max-h-none lg:h-full',
          )}
        >
          <div className="shrink-0 border-b border-slate-200 px-4 py-3 dark:border-surface-700">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                命中 {filteredHits.length}{strategyFilter !== 'all' ? ` / ${visibleHits.length}` : ''}
              </h2>
              {filteredHits.length > 0 && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void copyWatchlist()}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-800"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                  <button
                    type="button"
                    onClick={exportWatchlist}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-surface-800"
                  >
                    <Download className="h-3.5 w-3.5" />
                    导出 TV
                  </button>
                </div>
              )}
            </div>
            {exportNote && (
              <p className="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">{exportNote}</p>
            )}
            {hits.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setStrategyFilter('all')}
                  className={cn(
                    'rounded-md px-2 py-1 text-xs font-medium',
                    strategyFilter === 'all'
                      ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 dark:bg-surface-800 dark:text-slate-300',
                  )}
                >
                  全部 {strategyCounts.all}
                </button>
                {STRATEGIES.filter((item) => enabled[item.id]).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStrategyFilter(item.id)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-medium',
                      strategyFilter === item.id ? STRATEGY_TONE[item.id] : 'bg-slate-100 text-slate-600 dark:bg-surface-800 dark:text-slate-300',
                      strategyFilter === item.id && item.id === 'combo' && 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900',
                    )}
                  >
                    {item.short} {strategyCounts[item.id]}
                  </button>
                ))}
              </div>
            )}
          </div>
          {filteredHits.length === 0 ? (
            <p className="px-4 py-8 text-sm text-slate-500">
              {hits.length === 0 ? '还没有结果。扫描后点股票即可看K线。' : '这套策略当前没有命中。点「全部」看其他策略。'}
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-surface-800 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">代码</th>
                    <th className="px-4 py-2.5 font-medium">策略</th>
                    <th className="px-4 py-2.5 font-medium">RS</th>
                    <th className="px-4 py-2.5 font-medium">RVOL</th>
                    <th className="px-4 py-2.5 font-medium">ADR</th>
                    <th className="px-4 py-2.5 font-medium">涨跌</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHits.map((hit) => (
                    <tr
                      key={hit.symbol}
                      data-symbol={hit.symbol}
                      role="button"
                      tabIndex={0}
                      onClick={() => openHit(hit)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openHit(hit)
                        }
                      }}
                      className={cn(
                        'cursor-pointer border-t border-slate-100 dark:border-surface-800',
                        selected?.symbol === hit.symbol
                          ? 'bg-brand-50 dark:bg-brand-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-surface-800',
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <div className="font-semibold">{hit.symbol}</div>
                        {hitDetail(hit) && (
                          <div className="mt-0.5 text-[10px] text-slate-400">{hitDetail(hit)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {strategyTags(hit, enabled).map((id) => (
                            <span key={id} className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', STRATEGY_TONE[id])}>
                              {STRATEGIES.find((s) => s.id === id)?.short}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 tabular-nums">{hit.rsRating.toFixed(0)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{hit.rvol.toFixed(2)}</td>
                      <td className="px-4 py-2.5 tabular-nums">{hit.adr.toFixed(1)}%</td>
                      <td className={cn('px-4 py-2.5 tabular-nums', hit.changePct >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                        {hit.changePct >= 0 ? '+' : ''}{hit.changePct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {selected && (
          <div
            ref={chartBoxRef}
            className="card-surface order-1 flex min-h-0 flex-col overflow-hidden lg:order-2 lg:col-span-3 lg:h-full"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-surface-700">
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{selected.symbol}</h2>
                <p className="text-xs text-slate-500">
                  {strategyTags(selected, enabled).map((id) => STRATEGIES.find((s) => s.id === id)?.short).join(' · ') || '—'}
                  {' · '}RS {selected.rsRating.toFixed(0)}
                  {' · '}RVOL {selected.rvol.toFixed(2)}
                  {' · '}ADR {selected.adr.toFixed(1)}%
                  {selected.extended ? ' · 已延伸' : ''}
                  {hitDetail(selected) ? ` · ${hitDetail(selected)}` : ''}
                </p>
              </div>
              <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-surface-700">
                {(['1h', '1d', '1w'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setChartTf(option)}
                    className={cn(
                      'rounded-md px-2 py-1 text-xs font-medium',
                      chartTf === option
                        ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                        : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200',
                    )}
                  >
                    {option.toUpperCase()}
                  </button>
                ))}
              </div>
              <select
                className="form-input w-auto py-1 text-xs"
                value={chartBarsCount}
                onChange={(e) => setChartBarsCount(Number(e.target.value))}
                aria-label="K线根数"
              >
                {CHART_BAR_OPTIONS.map((n) => (
                  <option key={n} value={n}>显示 {n} 根</option>
                ))}
              </select>
              <a
                href={tradingViewUrl(selected.symbol)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
              >
                TV <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={finvizQuoteUrl(selected.symbol)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-slate-500 hover:underline"
              >
                Finviz
              </a>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-surface-800"
                aria-label="关闭图表"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
            <iframe
              key={`${selected.symbol}-${chartTf}-${resolvedTheme}`}
              title={`${selected.symbol} TradingView`}
              src={tvWidgetUrl(selected.symbol, chartTf, resolvedTheme)}
              className="h-[min(380px,42vh)] w-full border-0 bg-slate-900 lg:h-[min(420px,46vh)]"
            />

            <div className="border-t border-slate-200 dark:border-surface-700">
              {chartLoading && (
                <p className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在加载本地K线…
                </p>
              )}
              {chartError && (
                <p className="px-4 py-3 text-sm text-amber-700 dark:text-amber-300">{chartError}</p>
              )}
              {!chartLoading && chartBars.length > 0 && (
                <ScreenerCandleChart
                  bars={chartBars}
                  theme={resolvedTheme}
                  maxBars={chartBarsCount}
                  stage1Len={enabled.s1break ? settings.stage1Len : undefined}
                  spikeBars={settings.stage1SpikeBars}
                  showEma20
                />
              )}
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
