## 1. Types and schemas

- [x] 1.1 Add TypeScript types for bus route API responses (`BusRouteStop`, `BusRouteDirection`, `BusRouteResponse`) in `types/index.ts`
- [x] 1.2 Add Effect schemas for LTA `BusRoutes` list response and decoded domain route types in `types/schemas.ts`

## 2. Server data layer

- [x] 2.1 Implement paginated LTA `BusRoutes` fetch + 24h cache with pre-indexed `ServiceNo → Direction → ordered stops` structure in `lib/api-clients.ts`
- [x] 2.2 Implement `getBusRoute(serviceNo, stopId?)` that joins route stop codes to `getBusStops()` coordinates, drops missing coords, and sets preferred direction / `selectedStopIndex` when `stopId` is provided
- [x] 2.3 Export typed errors consistently with other LTA clients (missing key, upstream failure, not found)

## 3. API route

- [x] 3.1 Add `app/api/bus-routes/route.ts` with `serviceNo` required validation and optional `stopId` (reuse `BUS_STOP_ID_RE`)
- [x] 3.2 Wire route through shared `handle` + rate limit; return 400/404/5xx per specs
- [x] 3.3 Smoke-check endpoint locally against a known service (e.g. `12`) with and without `stopId`

## 4. Map overlay

- [x] 4.1 Extend `Map` props with bus route overlay data (coordinates, selected stop index, visibility/clear)
- [x] 4.2 Add MapLibre GeoJSON source + line layer(s) for full route and optional remaining-path emphasis
- [x] 4.3 Clear or replace overlay when overlay prop becomes null or service/direction changes; keep independent of MRT route layers

## 5. Bus panel interaction

- [x] 5.1 Add per-service “Route” control on arrival rows (do not overload expand-for-history)
- [x] 5.2 Emit `onShowRoute(serviceNo)` / `onClearRoute()` (or equivalent) to parent; show loading and error states on the active service
- [x] 5.3 When multiple directions are returned, default to preferred (or direction 1) and offer a direction switcher

## 6. Page wiring

- [x] 6.1 Add selected bus route state in `app/page.tsx` (service, stop context, fetch status, active direction, payload)
- [x] 6.2 Fetch `/api/bus-routes` when user requests a route; pass overlay props to `Map` and callbacks to `BusPanel`
- [x] 6.3 Clear route overlay when selected stop is cleared or user dismisses route; replace on service change

## 7. Verification

- [x] 7.1 Manually verify: select stop → show service route → polyline appears; switch service → overlay replaces; clear/deselect → overlay gone
- [x] 7.2 Manually verify multi-direction service and stop that appears on only one direction (preferred path)
- [x] 7.3 Run lint/typecheck (and any existing unit tests) and fix regressions
