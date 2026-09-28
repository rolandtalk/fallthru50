# fallthru50

`fallthru50` scans the 20 largest aggregated positions from
[`rolandtalk/portanahung2026apr`](https://github.com/rolandtalk/portanahung2026apr).

The target universe is ranked dynamically by current holding market value
(`aggregated shares × latest close`). A symbol matches when at least one of its
latest three valid trading-session closes is below the simple 50-session moving
average for that day.

## Signal semantics

- The latest three **valid closes** are used, so weekends, exchange holidays and
  missing values do not count as sessions.
- A close equal to MA50 is not below MA50.
- Fewer than 50 valid closes returns `matched: null` and `status: "unknown"`.
- A full negative result requires all three recent sessions to have an available
  MA50. This normally requires at least 52 valid closes.

## Run locally

```bash
npm install
npm test
npm start
```

Open <http://localhost:3000>.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `PORTANAHUNG_API_BASE_URL` | production Portanahung API origin | Portfolio and per-symbol completed-close source |
| `PORTANAHUNG_API_URL` | base URL + `/api/holdings/growth` | Optional holdings endpoint override |
| `CACHE_TTL_SECONDS` | `300` | Server-side scan cache duration |
| `REQUEST_TIMEOUT_MS` | `45000` | Source request deadline |

## Railway

The repository includes `railway.toml` and a `/health` endpoint. Create a
Railway service from this repository, deploy it, then generate a public domain
with the desired `fallthru50` service name.
