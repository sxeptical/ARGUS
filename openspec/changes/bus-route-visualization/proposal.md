## Why

ARGUS already lets users click a bus stop and see live arrivals for each service, but it does not show where those buses go. Without a route overlay, arrivals are numbers without spatial context. LTA DataMall already publishes ordered stop sequences via `BusRoutes`, and the map already draws MRT polylines — so route visualization is a natural next step for the bus layer.

## What Changes

- Fetch and cache LTA DataMall `BusRoutes` (and optionally `BusServices` metadata) on the server using the existing Effect + Cache pattern.
- Add a new API route that returns geometry-ready route data for a single service (ordered stop coordinates, direction, origin/destination labels).
- Extend `BusPanel` so selecting/expanding a service can request and highlight that service’s route.
- Draw the selected bus route on the MapLibre map as a polyline (stop-to-stop), with the selected stop marked, one active route at a time.
- Prefer showing the full published route, with optional emphasis on the remaining path from the selected stop when direction can be resolved.
- Clear the bus route overlay when the stop is deselected, another service is chosen, or the user dismisses the route.

## Capabilities

### New Capabilities

- `bus-routes`: Server-side access to LTA bus route sequences, join with stop coordinates, and a public API that returns a single service’s route geometry for map rendering.
- `bus-route-map`: Client map overlay and panel interaction for selecting a bus service at a stop and visualizing its route on the map.

### Modified Capabilities

None. No established specs in `openspec/specs/` yet for bus UI or map layers; this change introduces new capabilities rather than amending archived requirement sets.

## Impact

- **Data source**: LTA DataMall `BusRoutes` (same `LTA_API_KEY` already required for stops/arrivals). No new vendor keys.
- **New API**: `GET /api/bus-routes?serviceNo=…` (and optional direction/stop context query params as designed).
- **Files likely touched**:
  - `lib/api-clients.ts` — `getBusRoutes` / service lookup Effects
  - `types/index.ts`, `types/schemas.ts` — bus route types and LTA response schemas
  - `app/api/bus-routes/route.ts` — new route handler
  - `app/components/BusPanel.tsx` — service → show route action
  - `app/components/Map.tsx` — bus route GeoJSON layer
  - `app/page.tsx` — selected route state wiring
- **Performance**: `BusRoutes` is a large paginated dataset; must be fetched server-side once and cached aggressively (hours/days). Clients only receive the selected service.
- **UX**: One bus route visible at a time to avoid map clutter; MRT overlays remain independent.
- **Not in scope (v1)**: Road-following geometry, multi-service simultaneous routes, turn-by-turn navigation, live vehicle tracking along the route.
