import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAllHoldingsScan,
  buildPriceMa50Series,
  calculateFallThru50,
} from '../lib/scan.js'

function dates(count) {
  return Array.from({ length: count }, (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`)
}

test('matches when any of the latest three valid sessions is below MA50', () => {
  const closes = Array.from({ length: 52 }, () => 100)
  closes[50] = 99
  closes[51] = 101
  const result = calculateFallThru50(dates(52), closes)

  assert.equal(result.matched, true)
  assert.equal(result.status, 'match')
  assert.equal(result.belowCount, 1)
  assert.deepEqual(result.recentDays.map(day => day.belowMa50), [false, true, false])
})

test('returns clear when all three latest sessions are at or above MA50', () => {
  const closes = Array.from({ length: 52 }, () => 100)
  const result = calculateFallThru50(dates(52), closes)

  assert.equal(result.matched, false)
  assert.equal(result.status, 'clear')
  assert.equal(result.belowCount, 0)
})

test('returns unknown instead of false with fewer than 50 valid closes', () => {
  const result = calculateFallThru50(dates(49), Array.from({ length: 49 }, () => 100))

  assert.equal(result.matched, null)
  assert.equal(result.status, 'unknown')
  assert.equal(result.validDayCount, 49)
})

test('ignores missing closes when selecting the latest three trading sessions', () => {
  const allDates = dates(55)
  const closes = Array.from({ length: 55 }, () => 100)
  closes[52] = null
  closes[53] = 98
  const result = calculateFallThru50(allDates, closes)

  assert.equal(result.validDayCount, 54)
  assert.equal(result.status, 'match')
  assert.deepEqual(result.recentDays.map(day => day.date), [allDates[51], allDates[53], allDates[54]])
})

test('ranks and scans every holding instead of limiting the universe to 20', () => {
  const chartDates = dates(52)
  const holdings = Array.from({ length: 24 }, (_, index) => ({
    symbol: `S${String(index).padStart(2, '0')}`,
    marketValue: index * 100,
    chartCloses: Array.from({ length: 52 }, () => 100),
  }))
  const scan = buildAllHoldingsScan({ chartDates, holdings, asOf: '2026-09-28' })

  assert.equal(scan.rows.length, 24)
  assert.equal(scan.rows[0].symbol, 'S23')
  assert.equal(scan.rows.at(-1).symbol, 'S00')
})

test('builds a price curve with MA50 after fifty valid closes', () => {
  const points = dates(52).map((date, index) => ({ date, close: 100 + index }))
  points.splice(5, 0, { date: 'missing', close: null })
  const chart = buildPriceMa50Series(points)

  assert.equal(chart.validDayCount, 52)
  assert.equal(chart.points[48].ma50, null)
  assert.equal(chart.points[49].ma50, 124.5)
  assert.equal(chart.latestMa50, 126.5)
})

test('uses earlier history to extend MA50 across the full displayed curve', () => {
  const points = dates(120).map((date, index) => ({ date, close: 100 + index }))
  const chart = buildPriceMa50Series(points)

  assert.equal(chart.historyDayCount, 120)
  assert.equal(chart.validDayCount, 60)
  assert.equal(chart.points[0].date, points[60].date)
  assert.equal(chart.points[0].ma50, 135.5)
  assert.equal(chart.points.every(point => point.ma50 != null), true)
})
