const state = {
  rows: [],
  filter: 'all',
  query: '',
  sortKey: 'marketValue',
  sortDirection: 'desc',
}

const elements = {
  refresh: document.querySelector('#refresh-button'),
  updatedAt: document.querySelector('#updated-at'),
  body: document.querySelector('#results-body'),
  empty: document.querySelector('#empty-state'),
  search: document.querySelector('#search-input'),
  filters: [...document.querySelectorAll('.filter')],
  sorters: [...document.querySelectorAll('.sort-button')],
  remarkControl: document.querySelector('#remark-control'),
  remarkButton: document.querySelector('#remark-button'),
  remarkCard: document.querySelector('#app-remark'),
  matches: document.querySelector('#match-count'),
  clear: document.querySelector('#clear-count'),
  unknown: document.querySelector('#unknown-count'),
  total: document.querySelector('#total-count'),
  panel: document.querySelector('#chart-panel'),
  backdrop: document.querySelector('#chart-backdrop'),
  panelClose: document.querySelector('#chart-close'),
  chartTitle: document.querySelector('#chart-title'),
  chartAsOf: document.querySelector('#chart-as-of'),
  chartCloseValue: document.querySelector('#chart-close-value'),
  chartMa50Value: document.querySelector('#chart-ma50-value'),
  chartDistanceValue: document.querySelector('#chart-distance-value'),
  chartLoading: document.querySelector('#chart-loading'),
  chartSvg: document.querySelector('#price-chart'),
}

function money(value) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

function compactMoney(value) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
  }).format(value)
}

function price(value) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function shortDate(value) {
  if (!value) return '—'
  const parts = String(value).split('-')
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : value
}

function sessionMarkup(day) {
  const kind = day.belowMa50 === true ? 'below' : day.belowMa50 === false ? 'above' : 'unknown'
  const relation = day.belowMa50 === true ? 'Below' : day.belowMa50 === false ? 'Above' : 'N/A'
  const title = day.ma50 == null
    ? `${day.date}: MA50 unavailable`
    : `${day.date}: close ${price(day.close)}, MA50 ${price(day.ma50)}`
  return `<span class="session ${kind}" title="${escapeHtml(title)}"><b>${relation}</b><small>${shortDate(day.date)}</small></span>`
}

function statusLabel(status) {
  if (status === 'match') return 'Below MA50'
  if (status === 'clear') return 'Clear'
  return 'Unknown'
}

function visibleRows() {
  const query = state.query.trim().toUpperCase()
  const statusOrder = { match: 0, unknown: 1, clear: 2 }
  const rows = state.rows.filter(row => {
    const filterMatch = state.filter === 'all' || row.status === state.filter
    const searchMatch = !query || row.symbol.includes(query)
    return filterMatch && searchMatch
  })

  return rows.sort((left, right) => {
    const leftValue = state.sortKey === 'status' ? statusOrder[left.status] : left[state.sortKey]
    const rightValue = state.sortKey === 'status' ? statusOrder[right.status] : right[state.sortKey]
    const leftMissing = leftValue == null || (typeof leftValue === 'number' && !Number.isFinite(leftValue))
    const rightMissing = rightValue == null || (typeof rightValue === 'number' && !Number.isFinite(rightValue))

    if (leftMissing !== rightMissing) return leftMissing ? 1 : -1
    let comparison = 0
    if (typeof leftValue === 'string' || typeof rightValue === 'string') {
      comparison = String(leftValue).localeCompare(String(rightValue))
    } else {
      comparison = leftValue - rightValue
    }
    if (comparison === 0) return left.rank - right.rank
    return state.sortDirection === 'asc' ? comparison : -comparison
  })
}

function updateSortHeaders() {
  elements.sorters.forEach(button => {
    const active = button.dataset.sort === state.sortKey
    const header = button.closest('th')
    const indicator = button.querySelector('.sort-indicator')
    header.setAttribute('aria-sort', active
      ? state.sortDirection === 'asc' ? 'ascending' : 'descending'
      : 'none')
    button.classList.toggle('active', active)
    indicator.textContent = active ? state.sortDirection === 'asc' ? '↑' : '↓' : ''
  })
}

function render() {
  const rows = visibleRows()
  updateSortHeaders()
  elements.empty.hidden = rows.length !== 0
  elements.body.hidden = rows.length === 0
  elements.body.innerHTML = rows.map(row => {
    const distanceClass = row.distancePct == null ? '' : row.distancePct < 0 ? 'negative' : 'positive'
    const distance = row.distancePct == null ? '—' : `${row.distancePct > 0 ? '+' : ''}${row.distancePct.toFixed(2)}%`
    return `
      <tr class="stock-row" data-symbol="${escapeHtml(row.symbol)}" tabindex="0" title="Open ${escapeHtml(row.symbol)} price and MA50 curve">
        <td class="symbol">${escapeHtml(row.symbol)}</td>
        <td class="number value-column" title="${escapeHtml(money(row.marketValue))}">${compactMoney(row.marketValue)}</td>
        <td class="number distance-column ${distanceClass}">${distance}</td>
        <td class="status-column"><span class="status-badge ${row.status}">${statusLabel(row.status)}</span></td>
        <td class="number latest-column">${price(row.latestClose)}</td>
        <td class="number ma50-column">${price(row.latestMa50)}</td>
        <td class="sessions-column"><div class="session-list">${row.recentDays.map(sessionMarkup).join('')}</div></td>
      </tr>`
  }).join('')
}

function svgPath(values, xScale, yScale) {
  let path = ''
  let drawing = false
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      drawing = false
      return
    }
    path += `${drawing ? 'L' : 'M'}${xScale(index).toFixed(1)},${yScale(value).toFixed(1)} `
    drawing = true
  })
  return path.trim()
}

function renderChart(data) {
  const points = Array.isArray(data.points) ? data.points : []
  if (!points.length) throw new Error('No valid price history')

  const width = 760
  const height = 390
  const margin = { top: 22, right: 18, bottom: 42, left: 58 }
  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom
  const values = points.flatMap(point => [point.close, point.ma50]).filter(Number.isFinite)
  let minValue = Math.min(...values)
  let maxValue = Math.max(...values)
  const padding = Math.max((maxValue - minValue) * .1, maxValue * .01, 1)
  minValue -= padding
  maxValue += padding
  const xScale = index => margin.left + (index / Math.max(points.length - 1, 1)) * plotWidth
  const yScale = value => margin.top + ((maxValue - value) / (maxValue - minValue)) * plotHeight

  const grid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4
    const y = margin.top + ratio * plotHeight
    const value = maxValue - ratio * (maxValue - minValue)
    return `<line class="chart-grid" x1="${margin.left}" y1="${y}" x2="${width - margin.right}" y2="${y}"/><text class="chart-axis" x="${margin.left - 8}" y="${y + 3}" text-anchor="end">${price(value)}</text>`
  }).join('')

  const dateIndexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
  const dateLabels = dateIndexes.map(index => `<text class="chart-axis" x="${xScale(index)}" y="${height - 15}" text-anchor="middle">${escapeHtml(points[index].date.slice(5))}</text>`).join('')
  const closePath = svgPath(points.map(point => point.close), xScale, yScale)
  const ma50Path = svgPath(points.map(point => point.ma50), xScale, yScale)
  const last = points.at(-1)

  elements.chartSvg.innerHTML = `${grid}${dateLabels}<path class="chart-price" d="${closePath}"/><path class="chart-ma50" d="${ma50Path}"/>${Number.isFinite(last.close) ? `<circle class="chart-latest" cx="${xScale(points.length - 1)}" cy="${yScale(last.close)}" r="5"/>` : ''}`
}

function openPanelShell(symbol) {
  elements.backdrop.hidden = false
  requestAnimationFrame(() => {
    elements.backdrop.classList.add('open')
    elements.panel.classList.add('open')
  })
  elements.panel.setAttribute('aria-hidden', 'false')
  document.body.classList.add('panel-open')
  elements.chartTitle.textContent = symbol
  elements.chartAsOf.textContent = 'Loading completed-session history…'
  elements.chartCloseValue.textContent = '—'
  elements.chartMa50Value.textContent = '—'
  elements.chartDistanceValue.textContent = '—'
  elements.chartDistanceValue.className = ''
  elements.chartSvg.innerHTML = ''
  elements.chartLoading.hidden = false
  elements.panelClose.focus()
}

async function showChart(symbol) {
  openPanelShell(symbol)
  try {
    const response = await fetch(`/api/chart/${encodeURIComponent(symbol)}`)
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`)
    if (elements.chartTitle.textContent !== symbol) return

    const distance = Number.isFinite(data.latestMa50) && data.latestMa50 !== 0
      ? ((data.latestClose / data.latestMa50) - 1) * 100
      : null
    elements.chartAsOf.textContent = `${data.validDayCount} valid sessions · as of ${data.asOf || 'unknown'}`
    elements.chartCloseValue.textContent = price(data.latestClose)
    elements.chartMa50Value.textContent = price(data.latestMa50)
    elements.chartDistanceValue.textContent = distance == null ? '—' : `${distance > 0 ? '+' : ''}${distance.toFixed(2)}%`
    elements.chartDistanceValue.className = distance == null ? '' : distance < 0 ? 'negative' : 'positive'
    renderChart(data)
    elements.chartLoading.hidden = true
  } catch (error) {
    elements.chartLoading.hidden = true
    elements.chartSvg.innerHTML = `<text class="chart-error" x="380" y="195">${escapeHtml(error.message)}</text>`
    elements.chartAsOf.textContent = 'Curve unavailable'
  }
}

function closeChart() {
  elements.panel.classList.remove('open')
  elements.backdrop.classList.remove('open')
  elements.panel.setAttribute('aria-hidden', 'true')
  document.body.classList.remove('panel-open')
  window.setTimeout(() => { elements.backdrop.hidden = true }, 220)
}

function setRemarkOpen(open) {
  elements.remarkCard.hidden = !open
  elements.remarkButton.setAttribute('aria-expanded', String(open))
}

async function loadScan(force = false) {
  elements.refresh.disabled = true
  elements.refresh.classList.add('loading')
  elements.updatedAt.textContent = force ? 'Refreshing source data and rerunning scan…' : 'Running current scan…'

  try {
    const response = await fetch(force ? '/api/scan?refresh=1' : '/api/scan')
    const data = await response.json()
    if (!response.ok) throw new Error(data.detail || data.error || `HTTP ${response.status}`)

    state.rows = data.rows
    elements.matches.textContent = data.counts.matches
    elements.clear.textContent = data.counts.clear
    elements.unknown.textContent = data.counts.unknown
    elements.total.textContent = data.counts.total
    const sourceDate = data.sourceAsOf ? `market close ${data.sourceAsOf}` : 'latest available close'
    const cacheLabel = data.cached ? ' · cached' : ''
    elements.updatedAt.textContent = `${sourceDate} · ${data.dataSource || 'portfolio source'}${cacheLabel}`
    render()
  } catch (error) {
    state.rows = []
    elements.updatedAt.textContent = 'Scan unavailable'
    elements.body.hidden = false
    elements.empty.hidden = true
    elements.body.innerHTML = `<tr class="error-row"><td colspan="7">${escapeHtml(error.message)}. Try Refresh scan again.</td></tr>`
  } finally {
    elements.refresh.disabled = false
    elements.refresh.classList.remove('loading')
  }
}

elements.refresh.addEventListener('click', () => loadScan(true))
elements.remarkButton.addEventListener('click', () => {
  setRemarkOpen(elements.remarkButton.getAttribute('aria-expanded') !== 'true')
})
document.addEventListener('click', event => {
  if (!elements.remarkControl.contains(event.target)) setRemarkOpen(false)
})
elements.search.addEventListener('input', event => {
  state.query = event.target.value
  render()
})
elements.filters.forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter
  elements.filters.forEach(filter => filter.classList.toggle('active', filter === button))
  render()
}))
elements.sorters.forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.sort
  if (state.sortKey === key) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc'
  } else {
    state.sortKey = key
    state.sortDirection = key === 'symbol' || key === 'status' ? 'asc' : 'desc'
  }
  render()
}))
elements.body.addEventListener('click', event => {
  const row = event.target.closest('.stock-row')
  if (row) showChart(row.dataset.symbol)
})
elements.body.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const row = event.target.closest('.stock-row')
  if (!row) return
  event.preventDefault()
  showChart(row.dataset.symbol)
})
elements.panelClose.addEventListener('click', closeChart)
elements.backdrop.addEventListener('click', closeChart)
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return
  if (elements.remarkButton.getAttribute('aria-expanded') === 'true') {
    setRemarkOpen(false)
    elements.remarkButton.focus()
  }
  if (elements.panel.classList.contains('open')) closeChart()
})

loadScan()
