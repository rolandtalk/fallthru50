import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTop20Scan, calculateFallThru50 } from '../lib/scan.js'

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

test('ranks holdings by market value and limits the universe to 20', () => {
  const chartDates = dates(52)
  const holdings = Array.from({ length: 24 }, (_, index) => ({
    symbol: `S${String(index).padStart(2, '0')}`,
    marketValue: index * 100,
    chartCloses: Array.from({ length: 52 }, () => 100),
  }))
  const scan = buildTop20Scan({ chartDates, holdings, asOf: '2026-09-28' })

  assert.equal(scan.rows.length, 20)
  assert.equal(scan.rows[0].symbol, 'S23')
  assert.equal(scan.rows.at(-1).symbol, 'S04')
})
