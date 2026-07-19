## Context

ARGUS is a Singapore OSINT dashboard. The bus layer already:

- Loads all bus stops from LTA (`GET /api/bus-stops`) and plots them on MapLibre
- Lets users click a stop → `BusPanel` polls `GET /api/bus-arrivals?stopId=…`
- Expands a service row for ETA detail and local arrival history

MRT already has a richer spatial story: static geometry in `public/mrt-lines.json`, client-side path planning in `lib/mrt-routing.ts`, and a highlight layer on the map driven from `page.tsx`.

Bus services have no route geometry yet. LTA DataMall provides `BusRoutes` (ordered stop sequences per service/direction) which can be joined to existing stop lat/lng.

Constraints:

- Same `LTA_API_KEY` and Effect/`Cache`/`handle` stack as other LTA routes
- Client must not download the full national routes dump
- Map should stay readable: one bus route at a time
- Next.js app conventions may differ from training data — check `node_modules/next/dist/docs/` if touching app router APIs

## Goals / Non-Goals

**Goals:**

- Let a user at a selected stop pick a service and see that service’s path on the map
- Serve per-service route geometry from a cached LTA `BusRoutes` dataset
- Mirror existing API quality: validation, rate limits, typed errors, long-lived cache
- Keep UX lightweight inside the current bus panel + map shell

**Non-Goals:**

- Road-snapped / curb-level geometry
- Multi-service simultaneous route overlays
- Live bus vehicle tracking along the route (arrivals already give next vehicle ETAs)
- Door-to-door trip planning across bus+MRT
- Offline bundling of all routes into `public/`

## Decisions

### 1. Data source: LTA `BusRoutes` joined to `BusStops`

**Choice:** Page and cache LTA `BusRoutes`, index by `ServiceNo`, join each `BusStopCode` to coordinates from the existing bus stops catalog (also cached).

**Why:** Official sequences, same auth already in use, no third-party scrape.

**Alternatives considered:**

| Option | Pros | Cons |
| --- | --- | --- |
| Static GeoJSON dump in `public/` | Fast client load | Stale, large repo, manual updates |
| Third-party route APIs | Sometimes road geometry | New dependency, ToS, keys |
| Reconstruct from arrivals only | No new endpoint | Only nearby live buses, not full route |

### 2. API shape: per-service endpoint, not full dump

**Choice:** `GET /api/bus-routes?serviceNo={no}&stopId={optional}`

Example response (illustrative):

```json
{
  "serviceNo": "12",
  "directions": [
    {
      "direction": 1,
      "preferred": true,
      "selectedStopIndex": 14,
      "originCode": "75009",
      "destinationCode": "10009",
      "stops": [
        {
          "busStopCode": "75009",
          "description": "Bef Loyang Ave",
          "latitude": 1.37,
          "longitude": 103.97,
          "stopSequence": 1
        }
      ]
    }
  ]
}
```

**Why:** Small payloads; stop context enables preferred direction + remaining-path emphasis without a second round trip.

**Validation:**

- `serviceNo`: required, trimmed, length-capped, alphanumeric pattern consistent with LTA service numbers (e.g. `12`, `12e`, `NR1`)
- `stopId`: optional; when present, same 5-digit rule as bus-arrivals (`BUS_STOP_ID_RE`)

### 3. Server indexing strategy

**Choice:** On cache fill, build an in-memory structure:

```
Map<ServiceNo, Map<Direction, ordered BusRouteStop[]>>
```

Store either:

1. Raw route rows + derive on request, or
2. Pre-indexed map inside the cache value

Prefer **pre-indexed** after the multi-page fetch so each API hit is O(direction length) join work, not a full scan.

Join algorithm per request:

1. Lookup service → directions
2. For each stop code, attach lat/lng/description from `getBusStops()` cache
3. Drop stops with missing coordinates (log/count only); keep order of remaining
4. If `stopId` provided, compute `selectedStopIndex` / `preferred`

**Cache TTL:** 24 hours for routes (same order of magnitude as bus stops). Routes change rarely compared to arrivals (15s).

**Timeout:** Multi-page fetch needs a higher aggregate timeout similar to bus stops (`BUS_STOPS_TIMEOUT_MS` pattern).

### 4. Client state ownership in `page.tsx`

**Choice:** Lift a small `selectedBusRoute` state (or equivalent) in `page.tsx`:

```
selectedBusRoute: null | {
  serviceNo: string;
  stopId: string | null;
  data: BusRouteResponse | null;
  status: "idle" | "loading" | "error" | "ready";
  error?: string;
  direction: number; // active direction being drawn
}
```

- `BusPanel` emits `onShowRoute(serviceNo)` / `onClearRoute()`
- `page.tsx` fetches `/api/bus-routes` (SWR or one-shot fetch)
- `Map` receives `busRouteOverlay` props (coordinates + selected stop index)

**Why:** Matches MRT pattern (`mrtRoutePlan` → `mrtRouteSegments` → Map). Avoids Map owning network logic.

### 5. Map rendering: stop-to-stop LineString layer

**Choice:** Add a dedicated GeoJSON source/layers for bus route:

- Line layer for full route (slightly muted)
- Optional second line layer or feature for remaining segment (brighter) when `selectedStopIndex` is known
- Optional circle layer for route stops (sparse; only if it stays readable)
- Selected stop already highlighted via existing stop selection UX — keep that

Style should fit the dark tactical palette (distinct from MRT line colors; e.g. bus green already used for stops `#54ffae`).

**Why not road geometry:** LTA does not provide shape points; stop chords are acceptable for OSINT context.

**Lifecycle:**

- Set source data when overlay ready
- Clear source features on clear/deselect
- Independent of MRT route highlight source

### 6. UX interaction in `BusPanel`

**Choice:** On each service row, add an explicit control (button or secondary action) “Route” / map icon rather than overloading the existing expand-for-history click.

**Why:** Expand already toggles arrival pattern detail; conflating “expand” with “draw route” would surprise users who only wanted history.

Behavior:

1. Click Route → set active service for overlay → fetch
2. Click Route again on same service → clear (toggle)
3. Click Route on another service → replace
4. Changing selected stop clears previous overlay (or rebinds if user immediately picks a service on the new stop)

Direction switcher: small Dir 1 / Dir 2 control appears only when `directions.length > 1` and no single preferred direction (or always when multi-direction, defaulting to preferred).

### 7. Remaining-path emphasis

**Choice:** v1 includes remaining-path emphasis when index is known:

- Full route: lower opacity
- From `selectedStopIndex` → end: higher opacity / wider line

If index unknown, full route only.

### 8. Rate limits

**Choice:** Align with other LTA read APIs (e.g. ~60 req/min/IP class like bus-stops). Per-service responses are cheap once cached; limit mainly protects abuse of cold-cache stampede (mitigated by cache single-flight already in `Cache`).

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| `BusRoutes` payload is large; cold start slow | Long TTL, server-only cache, single-flight de-dup; optional warm on first bus-stops fetch later if needed |
| Some route stop codes missing from stops catalog | Skip missing coords; still return partial polyline |
| Direction ambiguity at shared corridor stops | Return both directions; preferred only when unique; UI switcher |
| Map clutter with stop circles + polyline | Default polyline (+ selected stop); stop dots optional/off |
| Service number variants (`12` vs `12e`) | Pass through exact `ServiceNo` from arrivals; validate loosely |
| User expects road-following paths | Document stop-to-stop as intentional v1; chords are normal for LTA-only data |
| Overlay orphaned when switching panels | Clear on stop deselect and explicit clear; replace on service change |

## Migration Plan

1. Ship server client + `/api/bus-routes` behind normal deploy (no client break)
2. Ship panel + map wiring in same release once API is stable
3. No DB migration; cache is in-memory (serverless cold starts re-fetch — acceptable with 24h TTL and de-dup)
4. Rollback: revert deploy; no persistent state

## Open Questions

- Should first open of any bus stop warm the routes cache in the background, or only on first “show route”?
  - **Default for implementation:** lazy on first route request (simpler).
- Show terminus names in the panel header when route loads?
  - **Default:** yes if origin/destination codes join cleanly to stop descriptions.
- Exact visual styling tokens (line width/opacity) — finalize during UI implementation against the current black minimal theme.
