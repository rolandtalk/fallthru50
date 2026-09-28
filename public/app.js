const state = {
  rows: [],
  filter: 'all',
  query: '',
}

const elements = {
  refresh: document.querySelector('#refresh-button'),
  updatedAt: document.querySelector('#updated-at'),
  body: document.querySelector('#results-body'),
  empty: document.querySelector('#empty-state'),
  search: document.querySelector('#search-input'),
  filters: [...document.querySelectorAll('.filter')],
  matches: document.querySelector('#match-count'),
  clear: document.querySelector('#clear-count'),
  unknown: document.querySelector('#unknown-count'),
  total: document.querySelector('#total-count'),
}

function money(value) {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
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
  return state.rows.filter(row => {
    const filterMatch = state.filter === 'all' || row.status === state.filter
    const searchMatch = !query || row.symbol.includes(query)
    return filterMatch && searchMatch
  })
}

function render() {
  const rows = visibleRows()
  elements.empty.hidden = rows.length !== 0
  elements.body.hidden = rows.length === 0
  elements.body.innerHTML = rows.map(row => {
    const distanceClass = row.distancePct == null ? '' : row.distancePct < 0 ? 'negative' : 'positive'
    const distance = row.distancePct == null ? '—' : `${row.distancePct > 0 ? '+' : ''}${row.distancePct.toFixed(2)}%`
    return `
      <tr title="${escapeHtml(row.reason)}">
        <td class="rank">${row.rank}</td>
        <td class="symbol">${escapeHtml(row.symbol)}</td>
        <td class="number">${money(row.marketValue)}</td>
        <td><span class="status-badge ${row.status}">${statusLabel(row.status)}</span></td>
        <td class="number">${price(row.latestClose)}</td>
        <td class="number">${price(row.latestMa50)}</td>
        <td class="number ${distanceClass}">${distance}</td>
        <td><div class="session-list">${row.recentDays.map(sessionMarkup).join('')}</div></td>
      </tr>`
  }).join('')
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
    elements.body.innerHTML = `<tr class="error-row"><td colspan="8">${escapeHtml(error.message)}. Try Refresh scan again.</td></tr>`
  } finally {
    elements.refresh.disabled = false
    elements.refresh.classList.remove('loading')
  }
}

elements.refresh.addEventListener('click', () => loadScan(true))
elements.search.addEventListener('input', event => {
  state.query = event.target.value
  render()
})
elements.filters.forEach(button => button.addEventListener('click', () => {
  state.filter = button.dataset.filter
  elements.filters.forEach(filter => filter.classList.toggle('active', filter === button))
  render()
}))

loadScan()
