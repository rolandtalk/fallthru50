import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildAllHoldingsScan,
  buildPriceMa50Series,
  selectAllHoldings,
} from './lib/scan.js'

const PORT = Number(process.env.PORT || 3000)
const UPSTREAM_BASE_URL = (process.env.PORTANAHUNG_API_BASE_URL
  || 'https://portanahunggoogsheet-production.up.railway.app').replace(/\/$/, '')
const HOLDINGS_URL = process.env.PORTANAHUNG_API_URL
  || `${UPSTREAM_BASE_URL}/api/holdings/growth`
const CACHE_TTL_MS = Math.max(0, Number(process.env.CACHE_TTL_SECONDS || 300)) * 1000
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.REQUEST_TIMEOUT_MS || 45000))
const root = path.dirname(fileURLToPath(import.meta.url))

let cache = null
let cacheExpiresAt = 0
let pendingScan = null
const chartCache = new Map()

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Source returned HTTP ${response.status}`)
  }
  return response.json()
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let nextIndex = 0

  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index])
    }
  }

  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    () => run(),
  ))
  return results
}

async function fetchScan() {
  const payload = await fetchJson(HOLDINGS_URL)
  const holdings = selectAllHoldings(payload)
  const withHistory = await mapWithConcurrency(holdings, 8, async holding => {
    const symbol = String(holding.symbol).toUpperCase()
    try {
      const detail = await fetchJson(
        `${UPSTREAM_BASE_URL}/api/holdings/symbol/${encodeURIComponent(symbol)}`,
      )
      const points = Array.isArray(detail?.points) ? detail.points : []
      chartCache.set(symbol, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: { symbol, ...buildPriceMa50Series(points), source: detail.source ?? null },
      })
      return {
        ...holding,
        chartDates: points.map(point => point.date),
        chartCloses: points.map(point => point.close),
      }
    } catch (error) {
      return {
        ...holding,
        chartDates: [],
        chartCloses: [],
        historyError: error instanceof Error ? error.message : String(error),
      }
    }
  })

  return buildAllHoldingsScan({ ...payload, holdings: withHistory })
}

async function getSymbolChart(symbol) {
  const cached = chartCache.get(symbol)
  if (cached && Date.now() < cached.expiresAt) return { ...cached.data, cached: true }

  const detail = await fetchJson(
    `${UPSTREAM_BASE_URL}/api/holdings/symbol/${encodeURIComponent(symbol)}`,
  )
  const data = {
    symbol,
    ...buildPriceMa50Series(detail?.points),
    source: detail?.source ?? null,
  }
  chartCache.set(symbol, { expiresAt: Date.now() + CACHE_TTL_MS, data })
  return { ...data, cached: false }
}

async function getScan(force = false) {
  const now = Date.now()
  if (!force && cache && now < cacheExpiresAt) return { ...cache, cached: true }
  if (!force && pendingScan) return pendingScan

  pendingScan = fetchScan()
    .then(scan => {
      cache = scan
      cacheExpiresAt = Date.now() + CACHE_TTL_MS
      return { ...scan, cached: false }
    })
    .finally(() => {
      pendingScan = null
    })
  return pendingScan
}

const app = express()
app.disable('x-powered-by')
app.use(express.static(path.join(root, 'public'), { extensions: ['html'] }))

app.get('/api/scan', async (request, response) => {
  try {
    response.set('Cache-Control', 'no-store')
    response.json(await getScan(request.query.refresh === '1'))
  } catch (error) {
    response.status(502).json({
      error: 'Unable to complete the MA50 scan',
      detail: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/api/chart/:symbol', async (request, response) => {
  const symbol = String(request.params.symbol || '').trim().toUpperCase()
  if (!/^[A-Z0-9.^=_:-]{1,32}$/.test(symbol)) {
    return response.status(400).json({ error: 'Invalid symbol' })
  }
  try {
    response.set('Cache-Control', 'no-store')
    return response.json(await getSymbolChart(symbol))
  } catch (error) {
    return response.status(502).json({
      error: `Unable to load ${symbol} chart`,
      detail: error instanceof Error ? error.message : String(error),
    })
  }
})

app.get('/health', (_request, response) => {
  response.json({ status: 'ok', app: 'fallthru50' })
})

app.listen(PORT, () => {
  console.log(`fallthru50 listening on port ${PORT}`)
})
