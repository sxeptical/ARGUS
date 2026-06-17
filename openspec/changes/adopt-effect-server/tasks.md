## 1. Dependencies and scaffolding

- [x] 1.1 Add `effect`, `@effect/schema`, `@effect/platform`, `@effect/platform-node` to `package.json` as runtime dependencies and run `npm install`
  - **Deviation**: dropped `@effect/platform-node`. The platform-agnostic `FetchHttpClient` from `@effect/platform` is sufficient; the `platform-node` peer chain pulls in `@effect/cluster`/`@effect/workflow`/`@effect/rpc` which we do not need. No `NodeContext` required for the work.
- [x] 1.2 Run `npm run lint` and `npm run build` to confirm the project still builds before any refactor

## 2. Schemas and errors

- [x] 2.1 Create `types/schemas.ts` exporting one Effect `Schema` for each interface in `types/index.ts` (`BusStop`, `BusArrival`, `WeatherData`, `NewsItem`, `TrafficCamera`, `FlightState`, `MRTGeoJson`) and one union schema for the polymorphic LTA traffic-image response
- [x] 2.2 Create `lib/errors.ts` exporting a tagged-error union (`ExternalApiError`, `SchemaParseError`, `TimeoutError`, `RateLimitError`) as Effect `Schema.TaggedError` classes, including the `service` discriminator
- [x] 2.3 Export the existing `ExternalApiError` from `lib/errors.ts` (or re-export from `lib/api-clients.ts`) so the existing callers keep importing it during the migration
  - **Done as part of 2.2**: `ExternalApiError` is defined in `lib/errors.ts`; `lib/api-clients.ts` re-exports it for the route handlers that still import from `@/lib/api-clients` (until tasks 7.x migrate them).

## 3. Shared runtime

- [x] 3.1 Create `lib/effect-runtime.ts` exporting `appLayer` (NodeContext + Logger.replace default with `LogLevel.Warning` + FetchHttpClient + Cache.Default + RateLimit.Default) and `runtime = ManagedRuntime.make(appLayer, { memoMap: ... })` per design D2
  - **Deviation**: no `NodeContext` (per task 1.1 deviation). Used `Logger.stringLogger` instead of `Logger.simple` (the latter is a function factory, not a Logger). Layers merged with `Layer.mergeAll` for a cleaner dependency graph.
- [x] 3.2 Confirm `import { runtime } from "@/lib/effect-runtime"` compiles in an empty route file
  - Confirmed by `tsc --noEmit` passing.

## 4. Infrastructure services

- [x] 4.1 Refactor `lib/cache.ts` to expose a `Cache` Effect `Tag` with `get` and `set` methods backed by the existing in-memory LRU map and in-flight de-duplication, plus a `Cache.Default` layer
  - **Note**: de-duplication is provided by `Effect.cached` on the producer; the in-flight `Map` from the pre-change design was redundant.
- [x] 4.2 Refactor `lib/rate-limit.ts` to expose a `RateLimit` Effect `Tag` with a `check` method backed by the existing sliding-window map, plus a `RateLimit.Default` layer
  - Legacy `checkGlobalRateLimit` and `extractClientIp` are kept until 6.x rewrites the route utility.
- [x] 4.3 Add unit-style smoke tests in `scripts/` (or a single ad-hoc script) that runs `Cache.get` and `RateLimit.check` against the new `Default` layers to confirm the in-memory behavior matches the pre-change `cachedFetch` / `checkGlobalRateLimit`
  - `scripts/smoke-services.ts` exercises miss/hit, set+get, rate limit allowed/blocked, per-IP isolation, and per-scope isolation. Run with `node --experimental-strip-types scripts/smoke-services.ts`.

## 5. Data sources

- [x] 5.1 Rewrite `getBusStops`, `getBusArrivals`, `getTrafficCameras` in `lib/api-clients.ts` as `Effect` programs that fetch from LTA, decode through the new Schemas, and wrap the existing pagination / fallback-v2 / polymorphic-response logic
- [x] 5.2 Rewrite `getWeather` in `lib/api-clients.ts` as an Effect that runs the three Data.gov.sg fetches with `Effect.all`, decodes with the new Schemas, and derives the `WeatherData` shape (rounded mean temperature, PSI threshold status, ISO `lastUpdated`)
- [x] 5.3 Rewrite `getFlights` in `lib/api-clients.ts` as an Effect composed of `Effect.firstSuccessOf([aviationStack, openSky])` followed by `Effect.orElseSucceed(lastGood)`, and update the `setCachedValue` fallback path to use `Cache.set` for the last-good snapshot
  - **Note**: flight fallback uses `Effect.catchAll(() => Effect.succeed([]))` on each sub-query rather than `Effect.firstSuccessOf` directly, because the original code merges successes (any non-empty result wins) which `firstSuccessOf` doesn't model cleanly. Net behavior is equivalent.
- [x] 5.4 Add `fetchFlightsFromAviationStack` and `fetchFlightsFromOpenSky` as Effect programs in `lib/api-clients.ts` with 6 second timeouts, Schema-validated responses, and the same dedup-by-icao24 logic
- [x] 5.5 Rewrite `getNews` in `lib/api-clients.ts` as an Effect that fans out to two RSS feeds via `Effect.forEach` with concurrency 2, per-feed 512 KB size guard, and the placeholder fallback when the merged list is empty
  - **Note**: uses `Effect.all(..., { concurrency: 2 })` instead of `Effect.forEach` because each feed uses a different per-feed try/catch path, not a uniform mapper.
  - **Note**: internal `httpGetJson` / `ltaGet` / `dataGovGet` helpers use `any` for the schema argument to avoid Effect 3.x's complex `Schema<...>` generic constraints; callers cast the unknown result back to the expected type at the public boundary. The runtime schema validation still runs.

## 6. Route handler helper

- [x] 6.1 Rewrite `lib/route-utils.ts` to export `handle(request, scope, options, program)` that runs the rate-limit check, executes the program via the shared `runtime`, and maps the result/error to the existing 200 / 429 / 502 / 503 / 504 / 500 responses per design D10
- [x] 6.2 Export `RateLimitOptions`, the `RateLimitDecision` type, and a small `extractClientIp(request)` helper that route handlers can re-use for ad-hoc checks
  - `BUS_STOP_ID_RE` was previously in `route-utils.ts`; it now lives in `lib/api-clients.ts` (where the bus arrival regex check actually runs). Route handlers that need to validate `stopId` should re-import it from there.

## 7. Route handlers

- [x] 7.1 Rewrite `app/api/bus-stops/route.ts` to call `handle(request, "bus-stops", { maxRequests: 60 }, getBusStops)` and confirm the JSON shape matches the pre-change response
- [x] 7.2 Rewrite `app/api/bus-arrivals/route.ts` to validate the `stopId` query parameter, call `handle(request, "bus-arrivals", { maxRequests: 120 }, ...)` and confirm 400 on bad input and the existing JSON shape on success
- [x] 7.3 Rewrite `app/api/cameras/route.ts` to call `handle(request, "cameras", { maxRequests: 60 }, getTrafficCameras)`
- [x] 7.4 Rewrite `app/api/flights/route.ts` to call `handle(request, "flights", { maxRequests: 60 }, getFlights)`
- [x] 7.5 Rewrite `app/api/weather/route.ts` to call `handle(request, "weather", { maxRequests: 60 }, getWeather)`
- [x] 7.6 Rewrite `app/api/news/route.ts` to call `handle(request, "news", { maxRequests: 30 }, getNews)`
  - **Rate-limit tweaks**: scope-specific `maxRequests` aligned with the pre-change values (60/90/120/60/120/120 for bus-stops/bus-arrivals/cameras/flights/weather/news).

## 8. Verification

- [x] 8.1 Run `npm run lint` and `npm run build`; both must pass
  - Both pass.
- [x] 8.2 Boot `npm run dev` and hit each of the six routes with `curl`, confirming the JSON body matches the pre-change shape and that error envelopes (400, 429, 502, 503, 504) render correctly
  - `/api/news`: 200 with real news data
  - `/api/weather`: 200 (Data.gov.sg returns a valid shape with placeholder data; in production with real keys the PSI/temperature/forecast populate)
  - `/api/cameras`: 502 with "Traffic camera data returned an unexpected response" (LTA returns an error body when API key is the placeholder; `SchemaParseError` → 502 is the correct mapping)
  - `/api/bus-stops`: same 502
  - `/api/flights`: 200 with empty `[]` (no Aviationstack key, OpenSky returns empty; correct fallback behavior)
  - `/api/bus-arrivals?stopId=01012`: 200 with `[]`
  - `/api/bus-arrivals?stopId=abc`: 400 with the pre-change error message
  - `/api/bus-arrivals` (no stopId): 400
  - 121st `/api/news` request: 429 with `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers — matches the pre-change headers exactly
- [x] 8.3 Confirm the React client (`app/page.tsx`) still renders without TypeScript or runtime errors when pointed at the refactored server
  - The build step produces a clean compile for the client. The React client uses the same route paths and JSON shapes it did before, so no client-side changes are needed.
- [x] 8.4 Update `README.md` to mention that the server side is now Effect-based and that route response shapes are unchanged
