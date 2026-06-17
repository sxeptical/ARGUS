## Why

ARGUS currently calls 5+ external providers (LTA DataMall, Data.gov.sg, Aviationstack, OpenSky, two RSS feeds) from 6 Next.js route handlers using bespoke `try/catch` chains, manual `AbortController` timeouts, `Promise.allSettled` fallback loops, and hand-rolled `as` casts on JSON. There is no schema validation of upstream responses, no structured logging, and no shared notion of what an "external API failure" means — the same condition is sometimes a thrown `Error` and sometimes a `null` sentinel. This makes the server side fragile, hard to test, and hard to extend with new sources.

Effect gives us typed errors, schema-validated parsing, declarative timeouts/retries, and structured concurrency out of the box. Adopting it on the server side directly improves reliability and observability of every data source without changing any client-visible behavior.

## What Changes

- Add `effect`, `@effect/schema`, `@effect/platform`, `@effect/platform-node` as runtime dependencies. No new dev tooling.
- Add a single shared `Runtime` layer at `lib/effect-runtime.ts` that the route handlers reuse.
- Refactor `lib/api-clients.ts` to return `Effect` programs. Each provider gets:
  - a Schema-validated response type,
  - a typed error channel (`ExternalApiError`, `ParseError`, `TimeoutError`),
  - a per-request `AbortSignal` timeout, and
  - where applicable, a declarative fallback chain (Aviationstack → OpenSky → last-good snapshot).
- Refactor `lib/cache.ts` to expose an Effect `Cache` service backed by the existing in-memory TTL map and request de-duplication.
- Refactor `lib/rate-limit.ts` to expose an Effect `RateLimit` service backed by the existing sliding window.
- Refactor `lib/route-utils.ts` so `getRateLimitResponse` and `getExternalApiErrorResponse` become Effect-based helpers used by every route.
- Rewrite all 6 `app/api/*/route.ts` handlers to run Effect programs via the shared runtime. The handlers remain thin: rate-limit check → call service → return `Response.json(...)` or an error response.
- No changes to `app/components/*`, `app/page.tsx`, `app/layout.tsx`, `lib/client-cache.ts`, `lib/mrt-routing.ts`, or `types/*`. The client keeps using `fetch` against unchanged route URLs and unchanged JSON shapes.
- Public contract preserved: route paths, HTTP methods, and response JSON shapes are byte-identical to the pre-change version. **Not a breaking change** for the React app or any external consumer.

## Capabilities

### New Capabilities

- `data-sources`: External API integration for LTA DataMall, Data.gov.sg, Aviationstack, OpenSky, and RSS news feeds. Each source declares its response Schema, its typed error channel, its timeout, and (for flights) its fallback chain.
- `infrastructure-services`: In-memory TTL cache with request de-duplication, and a per-IP sliding-window rate limiter. Both are exposed as Effect `Layer`s so they can be swapped in tests.
- `api-routes`: Standard route handler convention: rate-limit check → call service effect → translate result to `Response.json` or to a typed error response. Backed by a shared `RuntimeLayer` exported from `lib/effect-runtime.ts`.

### Modified Capabilities

None. No existing specs in `openspec/specs/` are affected — this change introduces capabilities, it does not modify established requirements.

## Impact

- **New dependencies**: `effect`, `@effect/schema`, `@effect/platform`, `@effect/platform-node` (all latest 3.x). No new dev tooling.
- **Files touched**:
  - `package.json`, `package-lock.json`
  - `lib/effect-runtime.ts` (new)
  - `lib/api-clients.ts` (rewritten as Effects)
  - `lib/cache.ts` (rewrapped as a service)
  - `lib/rate-limit.ts` (rewrapped as a service)
  - `lib/route-utils.ts` (rewritten on top of the services)
  - `app/api/bus-arrivals/route.ts`
  - `app/api/bus-stops/route.ts`
  - `app/api/cameras/route.ts`
  - `app/api/flights/route.ts`
  - `app/api/news/route.ts`
  - `app/api/weather/route.ts`
- **Files explicitly not touched**: `app/page.tsx`, `app/layout.tsx`, `app/components/*`, `lib/client-cache.ts`, `lib/mrt-routing.ts`, `types/*`, `app/error.tsx`, `app/global-error.tsx`.
- **Client bundle**: unchanged. Effect is only imported from server-side modules, so the Vercel client bundle is not affected.
- **Server bundle**: `effect` + `@effect/schema` add roughly 30–40 KB gzipped to the server bundle. Acceptable for the operational and reliability gains.
- **Behavior**: route paths, HTTP methods, JSON response shapes, and `setCachedValue` fallback semantics are preserved.
- **Observability**: every external call now flows through a typed error channel and can be wrapped with structured logging in one place.
- **Testability**: services are now injectable Layers, so the route handlers and provider logic become unit-testable with in-memory fakes instead of full HTTP mocks.
