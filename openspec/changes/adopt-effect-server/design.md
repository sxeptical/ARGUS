## Context

ARGUS is a Next.js 16 / React 19 OSINT dashboard. The server side consists of 6 route handlers under `app/api/*/route.ts` that call 5+ external providers. Today the server side has:

- Bespoke `try / catch` per route.
- Hand-rolled `AbortController` timeouts inside `fetchWithTimeout` and `AbortSignal.timeout(...)`.
- Mixed error conventions: `ExternalApiError` for LTA, plain `Error` for Aviationstack, `null` for the LTA 404 case, swallowed `catch {}` in the news RSS fan-out.
- `Promise.allSettled` to fan out the four Aviationstack queries and silently keep successes.
- `as` casts on every JSON parse, no runtime validation.
- `cachedFetch` and `setCachedValue` in `lib/cache.ts` as a singleton keyed by string.
- `checkGlobalRateLimit` in `lib/rate-limit.ts` as a sync function over a `Map`.
- An MRT route planner in `lib/mrt-routing.ts` that is pure synchronous code with module-level graph state.

The user wants Effect, `@effect/schema`, and `@effect/platform` adopted across the server side only. The React client, components, and `lib/mrt-routing.ts` are out of scope and must not change.

## Goals / Non-Goals

**Goals:**

- Every server-side data fetch is expressed as an `Effect` with a typed success type, a typed error channel, and an explicit `Duration` timeout.
- Every external JSON response is decoded through an Effect `Schema` before reaching route handlers.
- Caching and rate limiting are exposed as Effect `Layer`s so handlers depend on services, not on module-level singletons.
- The 6 route handlers shrink to a uniform `rateLimit → serviceCall → response` pipeline, running on a single shared `ManagedRuntime`.
- The public contract of every route (path, method, JSON shape, error envelope) is preserved byte-for-byte.

**Non-Goals:**

- No changes to the React client, `app/page.tsx`, `app/components/*`, or `lib/client-cache.ts`.
- No changes to `lib/mrt-routing.ts` (pure sync code with no I/O).
- No new dev tooling, no test framework introduction, no CI changes in this change.
- No retries, no `@effect/opentelemetry`, no `@effect/stream` in this change. They can come in follow-up changes.
- No replacement of the in-memory cache / rate limiter with Redis or any external store. That remains a follow-up if/when cross-instance enforcement is needed.

## Decisions

### D1. Use Effect 3.x core + Schema + Platform (FetchHttpClient)

- **Choice**: `effect@^3`, `@effect/schema@^3`, `@effect/platform@^1`, `@effect/platform-node@^1`.
- **Rationale**: Matches the user's "core: effect, @effect/schema, @effect/platform" selection. The user explicitly excluded Stream and OpenTelemetry. Fetch from `@effect/platform` uses `globalThis.fetch`, so it works on Vercel's Node 18+ / 20 / 22 runtimes without extra transport configuration.
- **Alternatives considered**: Using `axios` via `Effect.tryPromise` — rejected; Effect's HttpClient already gives us retries, timeouts, and interceptors as composable operators.

### D2. Single shared `ManagedRuntime` per server module

- **Choice**: `lib/effect-runtime.ts` exports `appLayer` and `runtime = ManagedRuntime.make(appLayer)`. Every route imports `runtime` and calls `runtime.runPromise(program)`.
- **Rationale**: Vercel serverless functions have warm starts. A module-level `ManagedRuntime` survives across invocations within the same instance, so layer construction cost is paid once per warm instance. Within a single invocation each call is independent (no fiber leak across requests).
- **Alternatives considered**: Per-request `Effect.runPromise` — rejected; would re-construct the entire layer graph on every request.

### D3. Tagged errors via Effect's `Schema.TaggedError` or a small enum

- **Choice**: Define a single union error type `AppError = ExternalApiError | SchemaParseError | TimeoutError | RateLimitError` using `Effect.TaggedError`-style classes. The existing `ExternalApiError` is upgraded with an `_tag` field so `Effect.tapErrorTag("ExternalApiError", ...)` works.
- **Rationale**: One union keeps the route handler exhaustiveness check simple. Tags let us pattern-match on cause for HTTP status mapping (`ExternalApiError` → 502/503, `RateLimitError` → 429, `SchemaParseError` → 502, `TimeoutError` → 504).
- **Alternatives considered**: `Either<HttpResponse, A>` at the route boundary — rejected; loses structured concurrency and tracing.

### D4. `Schema` lives next to types, not in place of them

- **Choice**: `types/index.ts` keeps its plain TypeScript interfaces (still consumed by React). A new `types/schemas.ts` exports Effect `Schema`s for the same shapes. Schemas and interfaces are checked to agree.
- **Rationale**: The client doesn't import Effect and we don't want to drag the runtime into the client bundle. Keeping the interfaces lets the React side continue with its zero-cost `import type` pattern.
- **Alternatives considered**: Replace interfaces with `Schema.Schema<A, I>` — rejected; would force `effect` into the client type graph.

### D5. `Effect.timeout` is the only timeout mechanism

- **Choice**: Drop `fetchWithTimeout` and `AbortSignal.timeout(...)`. Use `HttpClient.get` with a `Duration` timeout; the underlying `AbortSignal` is managed by the client.
- **Rationale**: The current `fetchWithTimeout` returns a promise that ignores `AbortError` outcomes inconsistently. `Effect.timeout(Duration.seconds(10))` produces a `TimeoutException` in the error channel and is the only place we read timeouts from.
- **Alternatives considered**: Keep `AbortSignal.timeout` inside the HTTP call — rejected; duplicates the timeout source of truth.

### D6. No retries in v1

- **Choice**: A single attempt per provider call, then fallback. Aviationstack's four sub-queries are still run in parallel via `Effect.all` (one Effect per call), partial successes are unioned.
- **Rationale**: Free public providers (OpenSky, LTA, Data.gov.sg) react badly to amplified load. Adding retries should be a deliberate, per-source decision, not the default.
- **Alternatives considered**: `Schedule.exponential` with 2 attempts on `ExternalApiError` — deferred; revisit once we have metrics on actual failure modes.

### D7. Flight fallback: `Effect.firstSuccessOf` + cached last-good snapshot

- **Choice**: `getFlights` is composed of `Effect.firstSuccessOf([aviationStack, openSky])` followed by `Effect.orElseSucceed(cachedLastGood)`. The last-good snapshot is stored via the same `Cache` service used for normal caching, so it inherits TTL semantics.
- **Rationale**: `firstSuccessOf` expresses the "try providers in order, stop at first non-empty success" intent more directly than the current `if (flights.length === 0)` ladder. The last-good fallback becomes a single line.
- **Alternatives considered**: Custom retry combinator — rejected; `firstSuccessOf` is the standard primitive for this.

### D8. Caching: small `Cache` service over the existing `Map`

- **Choice**: `lib/cache.ts` exports a `Cache` `Tag` plus a `Cache.Default` layer that wraps the existing in-memory map (LRU eviction at 500 entries, in-flight de-duplication, TTL).
- **Rationale**: The current implementation already does the right thing; we just want to put it behind a service boundary so tests can substitute a fake and so callers receive a typed `Effect<A, AppError, Cache>` instead of raw `Promise<A>`.
- **Alternatives considered**: Use `Effect.cachedWithTTL` directly — rejected; does not provide the in-flight de-duplication we need when many React polls hit the same key.

### D9. Rate limit: pure function behind an Effect `Tag`

- **Choice**: `lib/rate-limit.ts` keeps the same `Map`-backed sliding window. It exposes a `RateLimit` Tag with a single `check(ip, scope, max, windowMs): Effect<RateLimitDecision, never, never>` method, plus a `RateLimit.Default` layer.
- **Rationale**: It's already pure synchronous code. Wrapping it in `Effect.sync` is free and gives handlers a uniform shape (`yield* RateLimit`).
- **Alternatives considered**: Move the rate limit into middleware via `next/server` middleware — deferred; would change response timing semantics, not worth the risk in v1.

### D10. Route handler shape: a `handle(program, scope, options)` helper

- **Choice**: A `handle` helper in `lib/route-utils.ts` runs an Effect through `runtime`, applies the rate limit, and maps `AppError` to an HTTP `Response` using the existing response shapes.
- **Rationale**: Each route becomes ~10 lines: `export const GET = (req) => handle(req, "flights", { maxRequests: 60 }, getFlights)`. The existing `getRateLimitResponse` and `getExternalApiErrorResponse` are folded into this helper.
- **Alternatives considered**: Keep every handler custom — rejected; would leave the same boilerplate around the Effect code.

### D11. `mrt-routing.ts` is not touched

- **Choice**: `planMrtRoute` stays as a pure function. Its module-level graph state is built once at first import and reused. It is called from the client only, and adopting Effect here would buy us nothing.
- **Rationale**: There's no I/O, no async, no timeouts, no errors to type. Adding Effect would be ceremony.
- **Alternatives considered**: Wrap it in a `RoutePlanner` service — rejected; not justified by current or planned use.

## Risks / Trade-offs

- **Bundle size on the server**: `effect` + `@effect/schema` add roughly 30–40 KB gzipped to the server bundle. Acceptable. Mitigation: tree-shaking; we only import what we use.
- **Cold-start latency**: `ManagedRuntime.make` constructs layers on first import. If the layer graph grows, cold starts get slower. Mitigation: keep the layer graph small (NodeContext + Logger + HttpClient + Cache + RateLimit).
- **Effect 3.x is the actively-developed major; pinned major must be respected**. Mitigation: pin to `^3` and document the upgrade path.
- **`HttpClient` behavior under serverless**: we need to confirm `FetchHttpClient` is the right implementation for Vercel's Node 20 runtime. Mitigation: smoke-test against a deployed preview after the first task lands.
- **Pattern drift**: handlers written as Effects could be re-shaped in many ways. Mitigation: the `handle` helper is the only sanctioned entry point; deviations are caught in code review.
- **In-memory caches remain per-instance**: pre-existing constraint, not introduced by this change. Documented in `README.md` and noted in tasks.

## Migration Plan

1. Add `effect`, `@effect/schema`, `@effect/platform`, `@effect/platform-node` to `package.json`. `npm install`.
2. Land `lib/effect-runtime.ts` and the typed `AppError` union first. No callers yet.
3. Add `types/schemas.ts` with one Schema per existing interface. No callers yet.
4. Convert `lib/cache.ts` to expose a `Cache` service + `Cache.Default` layer, keeping the existing singleton behavior.
5. Convert `lib/rate-limit.ts` to expose a `RateLimit` service + `RateLimit.Default` layer.
6. Convert `lib/api-clients.ts` to return Effects. Each provider gets its own Schema, typed errors, timeout, and (for flights) a fallback chain.
7. Rewrite `lib/route-utils.ts` to expose `handle` and the response mapping helpers.
8. Rewrite each `app/api/*/route.ts` to call `handle`.
9. Run `npm run lint` and `npm run build`.
10. Manual smoke test against the dev server: hit each route, confirm JSON shape is identical to pre-change.

**Rollback strategy**: each task lands a self-contained change. If a task breaks the build, revert that single commit. There is no data migration.

## Open Questions

- Should the `AppError` union be exported from a single `lib/errors.ts` for cross-cutting import, or co-located with the service that produces it? **Proposal: a single `lib/errors.ts`. Easy to scan, easy to extend.**
- Should we add a `Logger.replace` with a minimal formatter (e.g. just `{ level, message, span }`) so the Vercel logs stay readable, or use the default Effect logger? **Proposal: keep the default Effect logger for v1. If logs are noisy in production, swap in v2.**
- Should `setCachedValue` from the pre-change cache remain public? **Proposal: yes — it is used by the flights fallback path, and the Effect version needs an explicit "store this snapshot" primitive.**
