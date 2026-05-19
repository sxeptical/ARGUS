# ARGUS

Singapore OSINT command center. Live transport, aviation, weather, cameras, and news on one tactical map.

## [Live Deployment: argus.vercel.app](https://argusint.vercel.app)

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=111)](https://react.dev/)
[![MapLibre](https://img.shields.io/badge/MapLibre-5.24-21b8a6)](https://maplibre.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/)

ARGUS is a Singapore-focused intelligence dashboard built for fast situational awareness. It pulls live public and commercial feeds into a dense terminal-style interface: bus stops, bus arrival timings, MRT overlays, traffic cameras, weather/PSI, news, and live aircraft around Singapore airspace.

It is designed as a single-page operations surface: map first, signal panels around it, and enough controls to hide noise when you only care about one layer.

[![ARGUS dashboard](https://image.thum.io/get/width/1600/crop/900/https://argus-rho-five.vercel.app)](https://argusint.vercel.app)

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

- API route rate limiting.
- In-memory caching for expensive calls.
- Partial page loading so one failed API does not blank the dashboard.
- Flight fallback chain: Aviationstack -> OpenSky -> latest successful snapshot.

---

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/sxeptical/ARGUS.git
cd ARGUS

# 2. Install dependencies
npm install

# 3. Add environment variables
cp .env.example .env.local

# 4. Start the dev server
npm run dev
```

Open `http://localhost:3000`.

If you do not have an `.env.example` yet, create `.env.local` manually using the API key section below.

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
  components/          Dashboard panels and MapLibre map
  page.tsx             Main command-center layout
lib/
  api-clients.ts       External API clients, parsing, fallback logic
  cache.ts             In-memory TTL cache
  rate-limit.ts        Lightweight API route rate limiting
public/
  mrt-lines.json       MRT line geometry
types/
  index.ts             Shared TypeScript data contracts
```

---

## Commands

```bash
npm run dev      # Start local development
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint
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
- API rate limits matter. Flight polling is the most likely source of quota pressure.

---

## License

Private project unless a license is added.
