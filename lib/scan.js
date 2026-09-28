const WINDOW = 50
const RECENT_SESSIONS = 3

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function round(value, digits = 2) {
  if (!isFiniteNumber(value)) return null
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/**
 * Evaluate the latest three valid trading sessions for a symbol.
 * Null closes are ignored, so exchange holidays and missing sessions do not
 * accidentally count as trading days.
 */
export function calculateFallThru50(chartDates, chartCloses) {
  const dates = Array.isArray(chartDates) ? chartDates : []
  const closes = Array.isArray(chartCloses) ? chartCloses : []
  const points = []

  for (let index = 0; index < Math.min(dates.length, closes.length); index += 1) {
    if (dates[index] && isFiniteNumber(closes[index])) {
      points.push({ date: dates[index], close: closes[index] })
    }
  }

  if (points.length < WINDOW) {
    return {
      matched: null,
      status: 'unknown',
      reason: `Only ${points.length} valid closes; ${WINDOW} are required`,
      validDayCount: points.length,
      recentDays: points.slice(-RECENT_SESSIONS).map(point => ({
        ...point,
        ma50: null,
        belowMa50: null,
      })),
      belowCount: null,
      latestClose: points.at(-1)?.close ?? null,
      latestMa50: null,
      distancePct: null,
    }
  }

  let rollingSum = 0
  const evaluated = points.map((point, index) => {
    rollingSum += point.close
    if (index >= WINDOW) rollingSum -= points[index - WINDOW].close
    const ma50 = index >= WINDOW - 1 ? rollingSum / WINDOW : null
    return {
      ...point,
      ma50,
      belowMa50: ma50 == null ? null : point.close < ma50,
    }
  })

  const recentDays = evaluated.slice(-RECENT_SESSIONS)
  const belowDays = recentDays.filter(day => day.belowMa50 === true)
  const fullyEvaluated = recentDays.length === RECENT_SESSIONS
    && recentDays.every(day => day.belowMa50 !== null)
  const latest = recentDays.at(-1)

  let status = 'clear'
  let matched = false
  let reason = 'None of the latest three trading sessions closed below MA50'

  if (belowDays.length > 0) {
    status = 'match'
    matched = true
    reason = `${belowDays.length} of the latest three trading sessions closed below MA50`
  } else if (!fullyEvaluated) {
    status = 'unknown'
    matched = null
    reason = 'There is not enough history to evaluate all three recent sessions'
  }

  return {
    matched,
    status,
    reason,
    validDayCount: points.length,
    recentDays: recentDays.map(day => ({
      date: day.date,
      close: round(day.close, 4),
      ma50: round(day.ma50, 4),
      belowMa50: day.belowMa50,
    })),
    belowCount: belowDays.length,
    latestClose: round(latest?.close, 4),
    latestMa50: round(latest?.ma50, 4),
    distancePct: latest?.ma50
      ? round(((latest.close / latest.ma50) - 1) * 100, 2)
      : null,
  }
}

export function selectTop20Holdings(payload) {
  const holdings = Array.isArray(payload?.holdings) ? payload.holdings : []
  return holdings
    .filter(holding => holding?.symbol && isFiniteNumber(holding.marketValue))
    .sort((left, right) => (
      (right.marketValue - left.marketValue)
      || String(left.symbol).localeCompare(String(right.symbol))
    ))
    .slice(0, 20)
}

export function buildTop20Scan(payload) {
  const chartDates = Array.isArray(payload?.chartDates) ? payload.chartDates : []
  const ranked = selectTop20Holdings(payload)

  const rows = ranked.map((holding, index) => {
    const signal = calculateFallThru50(
      Array.isArray(holding.chartDates) ? holding.chartDates : chartDates,
      holding.chartCloses,
    )
    return {
      rank: index + 1,
      symbol: String(holding.symbol).toUpperCase(),
      shares: holding.shares ?? null,
      marketValue: round(holding.marketValue, 2),
      asOf: holding.asOf ?? payload?.asOf ?? null,
      historyError: holding.historyError ?? null,
      ...signal,
      reason: holding.historyError ? `History unavailable: ${holding.historyError}` : signal.reason,
    }
  })

  return {
    generatedAt: new Date().toISOString(),
    sourceAsOf: payload?.asOf ?? null,
    sourceRetrievedAt: payload?.retrievedAt ?? null,
    dataSource: payload?.dataSource ?? null,
    targetDefinition: 'Top 20 aggregated holdings by current market value',
    rule: 'At least one of the latest three valid trading sessions closed below its 50-session simple moving average',
    counts: {
      total: rows.length,
      matches: rows.filter(row => row.status === 'match').length,
      clear: rows.filter(row => row.status === 'clear').length,
      unknown: rows.filter(row => row.status === 'unknown').length,
    },
    rows,
  }
}
