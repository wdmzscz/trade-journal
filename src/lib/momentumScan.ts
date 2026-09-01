export type ScanMode = 'any' | 'volspike' | 'quietspike' | 'stage12'
export type ScanTimeframe = '1h' | '1d' | '1w'
export type MbTarget = '2' | '3' | '2-3'
export type Stage2Side = 'long' | 'short' | 'both'

export type ScanSettings = {
  volAvgLen: number
  rvolThresh: number
  quietLen: number
  spikeBars: number
  spikeMult: number
  quietCvMax: number
  quietMaxMult: number
  reqUpBar: boolean
  reqHigherClose: boolean
  reqNearHigh: boolean
  nearHighLen: number
  nearHighPct: number
  reqAboveSma: boolean
  smaLen: number
  mode: ScanMode
  stage1Len: number
  stage1RangeMax: number
  stage1CvMax: number
  stage1SpikeBars: number
  stage1VolMult: number
  mbTarget: MbTarget
  mbLookback: number
  stage2Side: Stage2Side
  ema20Band: number
  gapMinPct: number
  gapRvol: number
}

export type Bar = {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type StrategyId = 's1break' | 'mbflush' | 'gap' | 'volume' | 'rs' | 'trend' | 'adr' | 'combo'

export const STRATEGIES: { id: StrategyId; label: string; short: string; hint: string }[] = [
  { id: 's1break', label: 'Stage1 突破', short: 'S1突破', hint: '自己填整理根数和波动上限，最近 1–3 根放量并收过阻力' },
  { id: 'mbflush', label: 'MB回踩20均', short: 'MB回踩', hint: '已在 Stage2，MB2/MB3 正在 flush，靠近 EMA20 等反弹' },
  { id: 'gap', label: '盘前盘后短线', short: '缺口短线', hint: '动量股里，盘前/盘后/跳空大涨或放量，看当天短线' },
  { id: 'volume', label: '你的放量', short: '放量', hint: '比均量高 50%，或前 30 根安静后突然放量，并靠近高点' },
  { id: 'rs', label: '相对强度', short: 'RS', hint: '近 20 根强于 SPY，且在本池里排前 30%' },
  { id: 'trend', label: '趋势模板', short: '趋势', hint: 'Minervini：站上 50/150/200，200 朝上，靠近年高' },
  { id: 'adr', label: '高ADR紧凑', short: 'ADR', hint: 'Qullamaggie：日均波幅够大、没飞太远、靠近高点' },
  { id: 'combo', label: '综合', short: '综合', hint: '放量 + RS + 趋势 + 离 20 均不超过 15%' },
]

export const CHART_BAR_OPTIONS = [20, 30, 40, 60, 80, 120] as const

export type ScanHit = {
  symbol: string
  pass: boolean
  volSpike: boolean
  quietSpike: boolean
  stage12: boolean
  rvol: number
  spikeX: number
  quietCv: number
  changePct: number
  close: number
  strategies: Record<StrategyId, boolean>
  rsRating: number
  beatSpy: boolean
  adr: number
  extended: boolean
  trendOk: boolean
  s1RangePct: number
  s1Cv: number
  s1High: number
  mbBursts: number
  ema20DistPct: number
  flushPct: number
  s2Side: 'long' | 'short' | null
  gapPct: number
  prePct: number | null
  postPct: number | null
  gapMove: number
}

export const DEFAULT_SCAN_SETTINGS: ScanSettings = {
  volAvgLen: 20,
  rvolThresh: 1.5,
  quietLen: 30,
  spikeBars: 2,
  spikeMult: 1.8,
  quietCvMax: 0.45,
  quietMaxMult: 1.8,
  reqUpBar: true,
  reqHigherClose: true,
  reqNearHigh: true,
  nearHighLen: 20,
  nearHighPct: 3,
  reqAboveSma: false,
  smaLen: 50,
  mode: 'any',
  stage1Len: 20,
  stage1RangeMax: 12,
  stage1CvMax: 5,
  stage1SpikeBars: 1,
  stage1VolMult: 1.5,
  mbTarget: '2-3',
  mbLookback: 50,
  stage2Side: 'long',
  ema20Band: 2.5,
  gapMinPct: 3,
  gapRvol: 1.5,
}

function parseWikiTickerTable(wikitext: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const match of wikitext.matchAll(/^\|\s*([A-Z][A-Z0-9.]{0,6})\s*\|/gm)) {
    const symbol = match[1]
    if (seen.has(symbol)) continue
    seen.add(symbol)
    out.push(symbol)
  }
  return out
}

async function fetchWikipediaWikitext(page: string, signal?: AbortSignal): Promise<string> {
  const url = `https://en.wikipedia.org/w/api.php?${new URLSearchParams({
    action: 'parse',
    page,
    prop: 'wikitext',
    format: 'json',
    origin: '*',
  })}`
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`)
  const data = (await res.json()) as { parse?: { wikitext?: { ['*']?: string } } }
  const text = data.parse?.wikitext?.['*']
  if (!text) throw new Error('Wikipedia 没有返回名单')
  return text
}

/** Live Nasdaq-100 constituents from Wikipedia. Currently ~101 names. */
export async function fetchNasdaq100(signal?: AbortSignal): Promise<string[]> {
  const symbols = parseWikiTickerTable(await fetchWikipediaWikitext('List of NASDAQ-100 companies', signal))
  if (symbols.length < 80) throw new Error(`Nasdaq-100 名单异常（${symbols.length} 只）`)
  return symbols
}

export const FINVIZ_RELVOL_URL =
  'https://finviz.com/screener.ashx?v=111&f=geo_usa,sh_avgvol_o200,sh_price_o5,sh_relvol_o1.5,ta_change_u,ta_sma20_pa&ft=4'

export function yahooSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\./g, '-')
}

export function parseTickerList(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\s,;]+/)) {
    const sym = raw.trim().toUpperCase()
    if (!sym || seen.has(sym)) continue
    if (!/^[A-Z][A-Z0-9./-]{0,9}$/.test(sym)) continue
    seen.add(sym)
    out.push(sym)
  }
  return out
}

function sma(values: number[], len: number, end: number): number | null {
  if (end + 1 < len) return null
  let sum = 0
  for (let i = end - len + 1; i <= end; i++) {
    if (!Number.isFinite(values[i])) return null
    sum += values[i]
  }
  return sum / len
}

function stdev(values: number[], len: number, end: number): number | null {
  const mean = sma(values, len, end)
  if (mean == null) return null
  let sum = 0
  for (let i = end - len + 1; i <= end; i++) {
    const d = values[i] - mean
    sum += d * d
  }
  return Math.sqrt(sum / len)
}

function highest(values: number[], len: number, end: number): number | null {
  if (end + 1 < len) return null
  let max = -Infinity
  for (let i = end - len + 1; i <= end; i++) {
    if (!Number.isFinite(values[i])) return null
    if (values[i] > max) max = values[i]
  }
  return max
}

function lowest(values: number[], len: number, end: number): number | null {
  if (end + 1 < len) return null
  let min = Infinity
  for (let i = end - len + 1; i <= end; i++) {
    if (!Number.isFinite(values[i])) return null
    if (values[i] < min) min = values[i]
  }
  return min
}

export function emaAt(values: number[], len: number, end: number): number | null {
  if (end + 1 < len) return null
  const seed = sma(values, len, len - 1)
  if (seed == null) return null
  const k = 2 / (len + 1)
  let e = seed
  for (let i = len; i <= end; i++) {
    e = values[i] * k + e * (1 - k)
  }
  return e
}

export function emaSeries(values: number[], len: number): Array<number | null> {
  const out: Array<number | null> = values.map(() => null)
  if (values.length < len) return out
  const seed = sma(values, len, len - 1)
  if (seed == null) return out
  const k = 2 / (len + 1)
  let e = seed
  out[len - 1] = e
  for (let i = len; i < values.length; i++) {
    e = values[i] * k + e * (1 - k)
    out[i] = e
  }
  return out
}

function countMomentumBursts(
  closes: number[],
  highs: number[],
  last: number,
  lookback: number,
  thresh: number,
): number {
  const excludeLast = 6
  const minSep = 3
  const start = Math.max(1, last - lookback)
  const end = last - excludeLast
  let count = 0
  let lastBurst = -999
  for (let i = start; i <= end; i++) {
    const prev = closes[i - 1]
    if (!prev || prev <= 0) continue
    const ret = closes[i] / prev - 1
    const priorHigh = highest(highs, Math.min(5, i), i - 1)
    const broke = priorHigh != null && closes[i] > priorHigh
    if (ret >= thresh || (broke && ret >= thresh * 0.55)) {
      if (i - lastBurst >= minSep) {
        count += 1
        lastBurst = i
      }
    }
  }
  return count
}

function matchesMbTarget(count: number, target: MbTarget): boolean {
  if (target === '2') return count === 2
  if (target === '3') return count === 3
  return count === 2 || count === 3
}

export function returnOver(closes: number[], barsBack: number): number | null {
  const last = closes.length - 1
  const prev = closes[last - barsBack]
  const now = closes[last]
  if (!prev || !now || prev <= 0) return null
  return now / prev - 1
}

export function marketBias(spyBars: Bar[]): 'bull' | 'neutral' | 'bear' {
  const last = spyBars.length - 1
  const closes = spyBars.map((b) => b.close)
  const s20 = sma(closes, 20, last)
  const s50 = sma(closes, 50, last)
  const close = spyBars[last]?.close
  if (close == null || s20 == null || s50 == null) return 'neutral'
  if (close > s20 && close > s50) return 'bull'
  if (close < s20 && close < s50) return 'bear'
  return 'neutral'
}

type SymbolMetrics = {
  symbol: string
  rvol: number
  spikeX: number
  quietCv: number
  changePct: number
  close: number
  volSpike: boolean
  quietSpike: boolean
  stage12: boolean
  volumePass: boolean
  nearHigh: boolean
  higherClose: boolean
  ret20: number | null
  adr: number
  extended: boolean
  trendOk: boolean
  tight: boolean
  s1Quiet: boolean
  s1Break: boolean
  s1RangePct: number
  s1Cv: number
  s1High: number
  mbFlush: boolean
  mbBursts: number
  ema20DistPct: number
  flushPct: number
  s2Side: 'long' | 'short' | null
  aboveSma20: boolean
  gapPct: number
  prePct: number | null
  postPct: number | null
}

export function scoreSymbol(symbol: string, bars: Bar[], settings: ScanSettings): SymbolMetrics | null {
  const last = bars.length - 1
  const s1Spike = Math.min(3, Math.max(1, Math.round(settings.stage1SpikeBars) || 1))
  const s1Len = Math.min(80, Math.max(3, Math.round(settings.stage1Len) || 20))
  const need = Math.max(
    settings.volAvgLen,
    settings.smaLen,
    settings.nearHighLen,
    settings.quietLen + settings.spikeBars + 1,
    s1Len + s1Spike + 2,
    settings.mbLookback + 10,
    50,
  )
  if (last < need) return null

  const volumes = bars.map((b) => b.volume)
  const highs = bars.map((b) => b.high)
  const lows = bars.map((b) => b.low)
  const closes = bars.map((b) => b.close)
  const bar = bars[last]
  const prev = bars[last - 1]
  if (!bar || !prev || bar.volume <= 0 || bar.close <= 0) return null

  const volAvg = sma(volumes, settings.volAvgLen, last)
  const rvol = volAvg && volAvg > 0 ? bar.volume / volAvg : null
  const volSpike = rvol != null && rvol >= settings.rvolThresh

  const quietEnd = last - settings.spikeBars
  const quietAvg = sma(volumes, settings.quietLen, quietEnd)
  const quietStd = stdev(volumes, settings.quietLen, quietEnd)
  const quietMax = highest(volumes, settings.quietLen, quietEnd)
  const recentMax = highest(volumes, settings.spikeBars, last)
  const quietCv = quietAvg && quietAvg > 0 && quietStd != null ? quietStd / quietAvg : null
  const spikeX = quietAvg && quietAvg > 0 && recentMax != null ? recentMax / quietAvg : null

  const isQuiet = quietCv != null && quietCv <= settings.quietCvMax
  const isCompressed = quietAvg != null && quietMax != null && quietMax <= quietAvg * settings.quietMaxMult
  const isSudden = spikeX != null && spikeX >= settings.spikeMult
  const quietSpikeRaw = isQuiet && isCompressed && isSudden

  const rangeHigh = highest(highs, settings.nearHighLen, last)
  const sma50 = sma(closes, 50, last)
  const sma20 = sma(closes, 20, last)
  const sma150 = sma(closes, 150, last)
  const sma200 = sma(closes, 200, last)
  const sma200Prev = last >= 220 ? sma(closes, 200, last - 20) : null
  const upBar = bar.close > bar.open
  const higherClose = bar.close > prev.close
  const nearHigh = rangeHigh != null && bar.close >= rangeHigh * (1 - settings.nearHighPct / 100)
  const aboveSma = sma50 != null && bar.close > sma50

  const priceOk =
    (!settings.reqUpBar || upBar) &&
    (!settings.reqHigherClose || higherClose) &&
    (!settings.reqNearHigh || nearHigh) &&
    (!settings.reqAboveSma || aboveSma)

  const sigVolSpike = volSpike && priceOk
  const sigQuietSpike = Boolean(quietSpikeRaw && priceOk)
  const sigStage12 = sigQuietSpike && volSpike
  const volumePass =
    settings.mode === 'volspike' ? sigVolSpike
    : settings.mode === 'quietspike' ? sigQuietSpike
    : settings.mode === 'stage12' ? sigStage12
    : sigVolSpike || sigQuietSpike

  const lookback = Math.min(252, last + 1)
  const high52 = highest(highs, lookback, last)
  const low52 = lowest(lows, lookback, last)
  const trendOk = Boolean(
    sma50 != null && sma150 != null && sma200 != null &&
    bar.close > sma50 && bar.close > sma150 && bar.close > sma200 &&
    sma150 > sma200 &&
    sma200Prev != null && sma200 > sma200Prev &&
    high52 != null && low52 != null &&
    bar.close >= high52 * 0.75 &&
    bar.close >= low52 * 1.25,
  )

  let adrSum = 0
  let adrN = 0
  for (let i = last - 19; i <= last; i++) {
    if (i < 0 || closes[i] <= 0) continue
    adrSum += ((highs[i] - lows[i]) / closes[i]) * 100
    adrN += 1
  }
  const adr = adrN ? adrSum / adrN : 0
  const extended = sma20 != null && bar.close > sma20 * 1.15
  const range5 = last >= 4 && highest(highs, 5, last) != null && lowest(lows, 5, last) != null
    ? (highest(highs, 5, last)! - lowest(lows, 5, last)!)
    : null
  const range20 = last >= 19 && highest(highs, 20, last) != null && lowest(lows, 20, last) != null
    ? (highest(highs, 20, last)! - lowest(lows, 20, last)!)
    : null
  const tight = range5 != null && range20 != null && range20 > 0 && range5 / range20 <= 0.5

  const s1End = last - s1Spike
  const s1High = highest(highs, s1Len, s1End)
  const s1Low = lowest(lows, s1Len, s1End)
  const s1Mean = sma(closes, s1Len, s1End)
  const s1Std = stdev(closes, s1Len, s1End)
  const s1VolAvg = sma(volumes, s1Len, s1End)
  const s1Mid = s1High != null && s1Low != null ? (s1High + s1Low) / 2 : null
  const s1RangePct = s1Mid && s1Mid > 0 && s1High != null && s1Low != null ? (s1High - s1Low) / s1Mid : 0
  const s1Cv = s1Mean && s1Mean > 0 && s1Std != null ? s1Std / s1Mean : 0
  const rangeLimit = Math.max(0.5, settings.stage1RangeMax) / 100
  const cvLimit = Math.max(0.2, settings.stage1CvMax) / 100
  const volMult = Math.max(1, settings.stage1VolMult)
  const s1Quiet = s1RangePct > 0 && s1RangePct <= rangeLimit && s1Cv <= cvLimit
  const spikeMaxClose = highest(closes, s1Spike, last)
  const spikeMaxVol = highest(volumes, s1Spike, last)
  const spikeBroke = s1High != null && spikeMaxClose != null && spikeMaxClose > s1High && bar.close > s1High
  const spikeVolOk = s1VolAvg != null && s1VolAvg > 0 && spikeMaxVol != null && spikeMaxVol >= s1VolAvg * volMult
  const s1Break = Boolean(s1Quiet && spikeBroke && spikeVolOk)

  const gapPct = prev.close > 0 ? ((bar.open - prev.close) / prev.close) * 100 : 0

  const ema20 = emaAt(closes, 20, last)
  const ema50 = emaAt(closes, 50, last)
  const ema20Prev = last >= 25 ? emaAt(closes, 20, last - 5) : null
  const ema20DistPct = ema20 && ema20 > 0 ? ((bar.close - ema20) / ema20) * 100 : 0
  const burstThresh = Math.max(0.02, (adr / 100) * 1.4)
  const mbBursts = countMomentumBursts(closes, highs, last, settings.mbLookback, burstThresh)
  const nearEma20 = ema20 != null && Math.abs(ema20DistPct) <= settings.ema20Band

  const swingHigh = highest(highs, 15, last - 1)
  const swingLow = lowest(lows, 15, last - 1)
  const flushLongPct = swingHigh && swingHigh > 0 ? (swingHigh - bar.close) / swingHigh : 0
  const flushShortPct = swingLow && swingLow > 0 ? (bar.close - swingLow) / swingLow : 0
  let downDays = 0
  let upDays = 0
  for (let i = last - 4; i <= last; i++) {
    if (i < 1) continue
    if (closes[i] < closes[i - 1]) downDays += 1
    if (closes[i] > closes[i - 1]) upDays += 1
  }
  const ema20Rising = ema20 != null && ema20Prev != null && ema20 > ema20Prev
  const ema20Falling = ema20 != null && ema20Prev != null && ema20 < ema20Prev
  const s2Long = Boolean(
    ema20 != null && ema50 != null && ema20 > ema50 && bar.close > ema50 * 0.97 && ema20Rising,
  )
  const s2Short = Boolean(
    ema20 != null && ema50 != null && ema20 < ema50 && bar.close < ema50 * 1.03 && ema20Falling,
  )
  const flushLong = Boolean(
    s2Long &&
    flushLongPct >= 0.025 &&
    flushLongPct <= 0.18 &&
    downDays >= 2 &&
    nearEma20 &&
    swingHigh != null &&
    ema20 != null &&
    swingHigh > ema20 * 1.03,
  )
  const flushShort = Boolean(
    s2Short &&
    flushShortPct >= 0.025 &&
    flushShortPct <= 0.18 &&
    upDays >= 2 &&
    nearEma20 &&
    swingLow != null &&
    ema20 != null &&
    swingLow < ema20 * 0.97,
  )
  const wantLong = settings.stage2Side !== 'short'
  const wantShort = settings.stage2Side !== 'long'
  const mbOk = matchesMbTarget(mbBursts, settings.mbTarget)
  const mbFlush = mbOk && ((wantLong && flushLong) || (wantShort && flushShort))
  const s2Side: 'long' | 'short' | null = flushLong ? 'long' : flushShort ? 'short' : s2Long ? 'long' : s2Short ? 'short' : null
  const flushPct = flushLong ? flushLongPct : flushShort ? flushShortPct : flushLongPct

  return {
    symbol,
    rvol: rvol ?? 0,
    spikeX: spikeX ?? 0,
    quietCv: quietCv ?? 0,
    changePct: prev.close > 0 ? ((bar.close - prev.close) / prev.close) * 100 : 0,
    close: bar.close,
    volSpike: sigVolSpike,
    quietSpike: sigQuietSpike,
    stage12: sigStage12,
    volumePass,
    nearHigh,
    higherClose,
    ret20: returnOver(closes, 20),
    adr,
    extended,
    trendOk,
    tight: Boolean(tight),
    s1Quiet,
    s1Break,
    s1RangePct,
    s1Cv,
    s1High: s1High ?? 0,
    mbFlush,
    mbBursts,
    ema20DistPct,
    flushPct,
    s2Side,
    aboveSma20: sma20 != null && bar.close > sma20,
    gapPct,
    prePct: null,
    postPct: null,
  }
}

function percentileRank(values: number[], value: number): number {
  if (values.length <= 1) return 50
  let below = 0
  for (const item of values) {
    if (item < value) below += 1
  }
  return (below / (values.length - 1)) * 100
}

export type ExtQuote = {
  prePct: number | null
  postPct: number | null
  preVol: number | null
  postVol: number | null
}

export function applyExtQuotes(rows: SymbolMetrics[], quotes: Map<string, ExtQuote>): void {
  for (const row of rows) {
    const q = quotes.get(row.symbol) ?? quotes.get(yahooSymbol(row.symbol))
    if (!q) continue
    row.prePct = q.prePct
    row.postPct = q.postPct
  }
}

function gapMoveOf(row: SymbolMetrics): number {
  return Math.max(row.gapPct, row.prePct ?? Number.NEGATIVE_INFINITY, row.postPct ?? Number.NEGATIVE_INFINITY)
}

export function assignStrategies(
  rows: SymbolMetrics[],
  spyRet20: number | null,
  settings: ScanSettings = DEFAULT_SCAN_SETTINGS,
  enabledIds?: readonly StrategyId[],
): ScanHit[] {
  const rets = rows.map((row) => row.ret20).filter((n): n is number => n != null)
  const hits: ScanHit[] = []

  for (const row of rows) {
    const rsRating = row.ret20 == null ? 0 : percentileRank(rets, row.ret20)
    const beatSpy = row.ret20 != null && spyRet20 != null && row.ret20 > spyRet20
    const volume = row.volumePass
    const rs = rsRating >= 70 && beatSpy && row.nearHigh && row.higherClose
    const trend = row.trendOk
    const adr = row.adr >= 4 && !row.extended && row.nearHigh && row.higherClose && (row.rvol >= 1.5 || row.tight)
    const combo = volume && rs && trend && !row.extended
    const s1break = row.s1Break
    const mbflush = row.mbFlush
    const gapMove = gapMoveOf(row)
    const momentumCore = row.trendOk || row.nearHigh || row.aboveSma20
    const gapUp = gapMove >= settings.gapMinPct
    const gapVol = row.rvol >= settings.gapRvol && gapMove >= Math.min(1, settings.gapMinPct * 0.4)
    const gap = momentumCore && (gapUp || gapVol)
    const strategies = { s1break, mbflush, gap, volume, rs, trend, adr, combo }
    if (enabledIds) {
      const active = new Set(enabledIds)
      for (const item of STRATEGIES) {
        if (!active.has(item.id)) strategies[item.id] = false
      }
    }
    if (!Object.values(strategies).some(Boolean)) continue

    hits.push({
      symbol: row.symbol,
      pass: true,
      volSpike: row.volSpike,
      quietSpike: row.quietSpike,
      stage12: row.stage12,
      rvol: row.rvol,
      spikeX: row.spikeX,
      quietCv: row.quietCv,
      changePct: row.changePct,
      close: row.close,
      strategies,
      rsRating,
      beatSpy,
      adr: row.adr,
      extended: row.extended,
      trendOk: row.trendOk,
      s1RangePct: row.s1RangePct,
      s1Cv: row.s1Cv,
      s1High: row.s1High,
      mbBursts: row.mbBursts,
      ema20DistPct: row.ema20DistPct,
      flushPct: row.flushPct,
      s2Side: row.s2Side,
      gapPct: row.gapPct,
      prePct: row.prePct,
      postPct: row.postPct,
      gapMove,
    })
  }

  return hits.sort((a, b) => {
    const ac = Object.values(a.strategies).filter(Boolean).length
    const bc = Object.values(b.strategies).filter(Boolean).length
    if (bc !== ac) return bc - ac
    return b.rsRating - a.rsRating
  })
}

export function evaluateMomentum(symbol: string, bars: Bar[], settings: ScanSettings): ScanHit | null {
  const row = scoreSymbol(symbol, bars, settings)
  if (!row) return null
  const [hit] = assignStrategies([row], null, settings)
  return hit ?? {
    symbol: row.symbol,
    pass: row.volumePass,
    volSpike: row.volSpike,
    quietSpike: row.quietSpike,
    stage12: row.stage12,
    rvol: row.rvol,
    spikeX: row.spikeX,
    quietCv: row.quietCv,
    changePct: row.changePct,
    close: row.close,
    strategies: {
      s1break: row.s1Break,
      mbflush: row.mbFlush,
      gap: false,
      volume: row.volumePass,
      rs: false,
      trend: row.trendOk,
      adr: false,
      combo: false,
    },
    rsRating: 0,
    beatSpy: false,
    adr: row.adr,
    extended: row.extended,
    trendOk: row.trendOk,
    s1RangePct: row.s1RangePct,
    s1Cv: row.s1Cv,
    s1High: row.s1High,
    mbBursts: row.mbBursts,
    ema20DistPct: row.ema20DistPct,
    flushPct: row.flushPct,
    s2Side: row.s2Side,
    gapPct: row.gapPct,
    prePct: row.prePct,
    postPct: row.postPct,
    gapMove: gapMoveOf(row),
  }
}

export function yahooRange(tf: ScanTimeframe): { interval: string; range: string } {
  if (tf === '1h') return { interval: '60m', range: '3mo' }
  if (tf === '1w') return { interval: '1wk', range: '5y' }
  return { interval: '1d', range: '2y' }
}

type YahooChart = {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>
          high?: Array<number | null>
          low?: Array<number | null>
          close?: Array<number | null>
          volume?: Array<number | null>
        }>
      }
    }>
    error?: { description?: string }
  }
}

export function barsFromYahoo(data: YahooChart): Bar[] {
  const result = data.chart?.result?.[0]
  const quote = result?.indicators?.quote?.[0]
  const stamps = result?.timestamp ?? []
  if (!quote) return []
  const { open = [], high = [], low = [], close = [], volume = [] } = quote
  const bars: Bar[] = []
  for (let i = 0; i < close.length; i++) {
    const o = open[i]
    const h = high[i]
    const l = low[i]
    const c = close[i]
    const v = volume[i]
    const t = stamps[i]
    if (![o, h, l, c, v].every((n) => typeof n === 'number' && Number.isFinite(n))) continue
    bars.push({ time: typeof t === 'number' ? t : i, open: o!, high: h!, low: l!, close: c!, volume: v! })
  }
  return bars
}

export function tvInterval(tf: ScanTimeframe): string {
  if (tf === '1h') return '60'
  if (tf === '1w') return 'W'
  return 'D'
}

export function tvWidgetUrl(symbol: string, tf: ScanTimeframe, theme: 'light' | 'dark'): string {
  const url = new URL('https://www.tradingview.com/widgetembed/')
  url.searchParams.set('symbol', yahooSymbol(symbol).replace(/-/g, '.'))
  url.searchParams.set('interval', tvInterval(tf))
  url.searchParams.set('theme', theme)
  url.searchParams.set('style', '1')
  url.searchParams.set('timezone', 'America/New_York')
  url.searchParams.set('locale', 'zh_CN')
  url.searchParams.set('hidesidetoolbar', '0')
  url.searchParams.set('hidetoptoolbar', '0')
  url.searchParams.set('symboledit', '0')
  url.searchParams.set('saveimage', '1')
  url.searchParams.set('withdateranges', '1')
  url.searchParams.set('hideideas', '1')
  url.searchParams.set('hidevolume', '0')
  return url.toString()
}

export function chartUrls(tf: ScanTimeframe): string[] {
  const { interval, range } = yahooRange(tf)
  const qs = `interval=${interval}&range=${range}&includePrePost=false`
  return [
    `/yahoo/v8/finance/chart/{symbol}?${qs}`,
    `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?${qs}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/{symbol}?${qs}`,
  ]
}

export async function fetchYahooBars(symbol: string, tf: ScanTimeframe, signal?: AbortSignal): Promise<Bar[]> {
  const ysym = encodeURIComponent(yahooSymbol(symbol))
  let lastError: unknown
  for (const template of chartUrls(tf)) {
    const url = template.replace('{symbol}', ysym)
    try {
      const res = await fetch(url, {
        signal,
        headers: { Accept: 'application/json' },
      })
      if (!res.ok) {
        lastError = new Error(`HTTP ${res.status}`)
        continue
      }
      const data = (await res.json()) as YahooChart
      if (data.chart?.error) {
        lastError = new Error(data.chart.error.description ?? 'Yahoo error')
        continue
      }
      const bars = barsFromYahoo(data)
      if (bars.length) return bars
      lastError = new Error('empty bars')
    } catch (err) {
      lastError = err
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string
      preMarketChangePercent?: number
      postMarketChangePercent?: number
      preMarketVolume?: number
      postMarketVolume?: number
    }>
  }
}

function quoteUrls(symbols: string[]): string[] {
  const qs = `symbols=${symbols.map((s) => encodeURIComponent(yahooSymbol(s))).join(',')}&crumb=`
  return [
    `/yahoo/v7/finance/quote?${qs}`,
    `https://query1.finance.yahoo.com/v7/finance/quote?${qs}`,
    `https://query2.finance.yahoo.com/v7/finance/quote?${qs}`,
  ]
}

export async function fetchYahooQuotes(symbols: string[], signal?: AbortSignal): Promise<Map<string, ExtQuote>> {
  const out = new Map<string, ExtQuote>()
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))]
  const chunkSize = 40
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize)
    let lastError: unknown
    let ok = false
    for (const url of quoteUrls(chunk)) {
      try {
        const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status}`)
          continue
        }
        const data = (await res.json()) as YahooQuoteResponse
        for (const item of data.quoteResponse?.result ?? []) {
          const symbol = item.symbol?.replace(/-/g, '.').toUpperCase()
          if (!symbol) continue
          out.set(symbol, {
            prePct: Number.isFinite(item.preMarketChangePercent) ? item.preMarketChangePercent! : null,
            postPct: Number.isFinite(item.postMarketChangePercent) ? item.postMarketChangePercent! : null,
            preVol: Number.isFinite(item.preMarketVolume) ? item.preMarketVolume! : null,
            postVol: Number.isFinite(item.postMarketVolume) ? item.postMarketVolume! : null,
          })
          out.set(yahooSymbol(symbol), out.get(symbol)!)
        }
        ok = true
        break
      } catch (err) {
        lastError = err
      }
    }
    if (!ok && lastError && signal?.aborted) throw lastError
  }
  return out
}

const SP500_CSV =
  'https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv'

export async function fetchSp500(signal?: AbortSignal): Promise<string[]> {
  try {
    const wiki = parseWikiTickerTable(await fetchWikipediaWikitext('List of S&P 500 companies', signal))
    if (wiki.length >= 400) return wiki
  } catch {
    /* fall through to the GitHub dataset */
  }
  const res = await fetch(SP500_CSV, { signal })
  if (!res.ok) throw new Error(`无法加载 S&P 500（${res.status}）`)
  const text = await res.text()
  const lines = text.split(/\r?\n/).slice(1)
  const symbols: string[] = []
  for (const line of lines) {
    const symbol = line.split(',')[0]?.replace(/"/g, '').trim()
    if (symbol) symbols.push(symbol)
  }
  if (symbols.length < 50) throw new Error('S&P 500 名单异常')
  return symbols
}

export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(yahooSymbol(symbol))}`
}

export function tvWatchlistSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/-/g, '.')
}

/** TradingView watchlist import: first line ###name, then one ticker per line. */
export function tvWatchlistText(symbols: string[], title: string, exchange?: string): string {
  const seen = new Set<string>()
  const lines = [`###${title}`]
  for (const raw of symbols) {
    const sym = tvWatchlistSymbol(raw)
    if (!sym || seen.has(sym)) continue
    seen.add(sym)
    lines.push(exchange ? `${exchange}:${sym}` : sym)
  }
  return `${lines.join('\n')}\n`
}

export function finvizQuoteUrl(symbol: string): string {
  return `https://finviz.com/quote.ashx?t=${encodeURIComponent(yahooSymbol(symbol))}`
}

export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function run() {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()))
  return results
}
