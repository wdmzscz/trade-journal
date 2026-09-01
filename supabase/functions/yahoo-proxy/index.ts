const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

const SYMBOL_RE = /^[A-Z0-9.^/=-]{1,20}$/i
const INTERVALS = new Set(['60m', '1d', '1wk'])
const RANGES = new Set(['3mo', '2y', '5y'])

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseParams(req: Request): URLSearchParams {
  const url = new URL(req.url)
  return url.searchParams
}

async function yahooGet(pathAndQuery: string): Promise<Response> {
  const urls = [
    `https://query1.finance.yahoo.com${pathAndQuery}`,
    `https://query2.finance.yahoo.com${pathAndQuery}`,
  ]
  let last: Response | null = null
  for (const url of urls) {
    const res = await fetch(url, { headers: YAHOO_HEADERS })
    last = res
    if (res.ok) return res
  }
  return last ?? new Response('Yahoo unavailable', { status: 502 })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const params = parseParams(req)
    let kind = params.get('kind')
    let symbol = params.get('symbol')
    let interval = params.get('interval')
    let range = params.get('range')
    let symbols = params.get('symbols')

    if (req.method === 'POST') {
      const body = await req.json().catch(() => null) as {
        kind?: string
        symbol?: string
        interval?: string
        range?: string
        symbols?: string
      } | null
      kind = body?.kind ?? kind
      symbol = body?.symbol ?? symbol
      interval = body?.interval ?? interval
      range = body?.range ?? range
      symbols = body?.symbols ?? symbols
    }

    if (kind === 'chart') {
      if (!symbol || !SYMBOL_RE.test(symbol)) return json({ error: 'invalid symbol' }, 400)
      if (!interval || !INTERVALS.has(interval)) return json({ error: 'invalid interval' }, 400)
      if (!range || !RANGES.has(range)) return json({ error: 'invalid range' }, 400)
      const qs = new URLSearchParams({
        interval,
        range,
        includePrePost: 'false',
      })
      const upstream = await yahooGet(`/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`)
      const text = await upstream.text()
      return new Response(text, {
        status: upstream.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (kind === 'quote') {
      const list = (symbols ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
      if (list.length === 0 || list.length > 40) return json({ error: 'invalid symbols' }, 400)
      if (list.some((item) => !SYMBOL_RE.test(item))) return json({ error: 'invalid symbol' }, 400)
      const qs = new URLSearchParams({ symbols: list.join(',') })
      const upstream = await yahooGet(`/v7/finance/quote?${qs}`)
      const text = await upstream.text()
      return new Response(text, {
        status: upstream.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return json({ error: 'kind must be chart or quote' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'proxy failed'
    return json({ error: message }, 500)
  }
})
