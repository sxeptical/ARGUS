# ARGUS

Singapore OSINT command center. Live transport, aviation, weather, cameras, and news on one tactical map.

https://www.argusint.live

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=111)](https://react.dev/)
[![MapLibre](https://img.shields.io/badge/MapLibre-6.4-21b8a6)](https://maplibre.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/)
[![Bun](https://img.shields.io/badge/Bun-1.4-f9f1e1?logo=bun&logoColor=f472b6)](https://bun.sh/)

ARGUS is a Singapore-focused intelligence dashboard built for fast situational awareness. It pulls live public and commercial feeds into a dense terminal-style interface: bus stops, bus arrival timings, MRT overlays, traffic cameras, weather/PSI, news, and live aircraft around Singapore airspace.

It is designed as a single-page operations surface: map first, signal panels around it, and enough controls to hide noise when you only care about one layer.

<img width="1894" height="1052" alt="image" src="https://github.com/user-attachments/assets/e2a33c21-72bd-4709-819e-d9d1305726e7" />

---

## What You Get

### Live Map

- MapLibre dark map centered on Singapore.
- Toggleable sensor layers for flights, road cameras, bus stops, and MRT.
- Flight markers rendered as heading-aware airplane icons.
- MRT line overlays with station points and labels.
- Clickable bus stops for arrival timings.
- Clickable road cameras for traffic image previews.

### Sensor Grid

- Air activity counts.
- Road camera node counts.
- Bus stop coverage.
- MRT network visibility.
- Quick ON/OFF controls for each map sensor.

### Singapore Feeds

- LTA bus stops and live bus arrivals.
- LTA road traffic camera images.
- Data.gov.sg weather, PSI, and air temperature.
- Aviationstack flights for Singapore airports, with OpenSky fallback.
- Singapore news feed merge from public RSS sources.

### Resilience

- API route rate limiting (per-IP sliding window, in-memory).
- In-memory caching for expensive calls.
- Partial page loading so one failed API does not blank the dashboard.
- Flight fallback chain: Aviationstack -> OpenSky -> latest successful snapshot.

---

## Quick Start

Requires [Bun](https://bun.sh) 1.4 or later. Install from bun.sh — the `packageManager` field is informational and does not auto-install via Corepack.

```bash
# 1. Clone the repo
git clone https://github.com/sxeptical/ARGUS.git
cd ARGUS

# 2. Install dependencies
bun install

# 3. Add environment variables
cp .env.example .env.local

# 4. Start the dev server
bun run dev
```

Open `http://localhost:3000`.

---

## API Keys

ARGUS can run with partial data, but the best experience needs these keys:

| Key | Required For | Notes |
| --- | --- | --- |
| `LTA_API_KEY` | Bus stops, bus arrivals, traffic cameras | Get this from Singapore LTA DataMall. |
| `AVIATIONSTACK_API_KEY` | Primary flight feed | Used for live flights around Changi/Seletar. |

Example:

```env
LTA_API_KEY=your_lta_datamall_key
AVIATIONSTACK_API_KEY=your_aviationstack_key
```

Weather and news currently use public endpoints and do not require keys.

---

## Data Sources

| Source | Used For |
| --- | --- |
| LTA DataMall | Bus stops, bus arrivals, traffic cameras |
| Data.gov.sg | Weather forecast, PSI, temperature |
| Aviationstack | Live commercial flight data |
| OpenSky Network | Flight fallback when Aviationstack is unavailable |
| The Straits Times RSS | Singapore headlines |
| CNA RSS | Singapore headlines |

---

## Project Structure

```text
app/
  api/                 Next.js route handlers for live data
  components/          Dashboard panels, MapLibre map, and dashboard/ subpanels
  hooks/               Dashboard data, state, route, history, and MRT state
  page.tsx             Thin command-center composition (logic in hooks/)
lib/
  api-clients/         Typed HTTP clients split by source/domain
  cache.ts             In-memory TTL cache
  map-geometry.ts      Pure GeoJSON builders for bus/MRT overlays
  mrt-network.ts       Single source of truth for MRT stations
  mrt-routing.ts       MRT route planning (Dijkstra + binary heap)
  rate-limit.ts        Lightweight API route rate limiting
public/
  mrt-lines.json       MRT line geometry
types/
  schemas.ts           Runtime schemas and schema-derived contracts
  index.ts             Client-facing domain contracts
```

---

## Commands

```bash
bun run dev      # Start local development
bun run build    # Production build
bun run start    # Start production server
bun run lint     # ESLint
bun run test     # Unit and regression tests
bun run typecheck # Native TypeScript 7 check
bun run verify   # Typecheck, lint, test, and production build
```

---

## Vercel Deployment

Set the environment variables in Vercel Project Settings:

- `LTA_API_KEY`
- `AVIATIONSTACK_API_KEY`

Make sure they are enabled for the environment you are deploying to:

- Production
- Preview
- Development, if you use Vercel CLI locally

After editing env vars in Vercel, redeploy the project. Vercel deployments do not automatically pick up changed env vars until a new deployment is created.

---

## Notes

- Flight direction is best-effort. Aviationstack airport metadata is used when available; otherwise heading relative to Changi is used.
- Serverless memory is not guaranteed across Vercel invocations, so cached fallbacks help during warm periods but should not be treated as durable storage.
- The bundled cache and rate limiter are in-memory, per-runtime-instance protections. **In production on Vercel, each serverless instance has its own rate limit state** — limits are not shared across instances or cold starts. For hard cross-instance limits, use Vercel Firewall, an edge middleware KV store, or Redis. On Vercel (`VERCEL=1`) the IP extractor trusts `x-vercel-forwarded-for`, which the edge overwrites. Self-hosted deployments ignore that header unless `ARGUS_TRUST_PROXY_HEADERS=true` is set behind a trusted proxy.
- API rate limits matter. Flight polling is the most likely source of quota pressure.

---
