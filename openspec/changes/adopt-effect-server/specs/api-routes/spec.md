## ADDED Requirements

### Requirement: Shared route handler helper
The system SHALL expose a `handle` helper in `lib/route-utils.ts` that takes a `Request`, a scope name, optional rate-limit options, and an `Effect` producer. The helper SHALL first run the rate-limit check, returning a 429 `Response` with `Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers when the limit is exceeded. The helper SHALL then run the producer through the shared `runtime`. The helper SHALL map the success value to a JSON `Response` with status 200. The helper SHALL map errors to the same status codes and response shapes used by the pre-change implementation: `ExternalApiError` with status 429 → 503 with `Retry-After: 60`; `ExternalApiError` with status ≥ 500 → 502; other `ExternalApiError` → 503; `SchemaParseError` → 502; `TimeoutError` → 504; unhandled errors → 500 with a generic message.

#### Scenario: Rate limit exceeded
- **WHEN** `handle` is called and the rate limit decision has `allowed = false`
- **THEN** the response has status 429 and the headers `Retry-After`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` set per the rate-limit service

#### Scenario: Producer succeeds
- **WHEN** `handle` is called and the producer Effect succeeds
- **THEN** the response has status 200 and a JSON body equal to the producer's success value

#### Scenario: Producer fails with `ExternalApiError` 429
- **WHEN** `handle` is called and the producer Effect fails with `ExternalApiError { status: 429 }`
- **THEN** the response has status 503 and the `Retry-After: 60` header

#### Scenario: Producer fails with `ExternalApiError` 5xx
- **WHEN** `handle` is called and the producer Effect fails with `ExternalApiError { status: 502 }`
- **THEN** the response has status 502

#### Scenario: Producer fails with `TimeoutError`
- **WHEN** `handle` is called and the producer Effect fails with `TimeoutError`
- **THEN** the response has status 504

#### Scenario: Producer fails with `SchemaParseError`
- **WHEN** `handle` is called and the producer Effect fails with `SchemaParseError`
- **THEN** the response has status 502

#### Scenario: Producer fails with an unknown error
- **WHEN** `handle` is called and the producer Effect fails with an error that does not match any known tag
- **THEN** the response has status 500 and a JSON body of `{ "error": "Internal server error" }`

### Requirement: Route handler shape
The six route handlers under `app/api/*/route.ts` SHALL each export a `GET` function whose body is a single call to `handle` with the appropriate scope, options, and producer. The route paths, HTTP methods, success response JSON shapes, and error response JSON shapes SHALL be byte-identical to the pre-change implementation.

#### Scenario: GET /api/bus-stops
- **WHEN** a client sends `GET /api/bus-stops`
- **THEN** the response is JSON of type `BusStop[]` when the LTA client succeeds, and a JSON error body of `{ "error": "Bus stops are temporarily unavailable" }` with status 503 (or 502 for LTA 5xx, 502 for parse errors) when the LTA client fails

#### Scenario: GET /api/bus-arrivals?stopId=...
- **WHEN** a client sends `GET /api/bus-arrivals?stopId=<5 digits>`
- **THEN** the response is JSON of type `BusArrival[]` when the LTA client succeeds, a 400 JSON error when the `stopId` does not match `^\d{5}$`, and a 503/502 JSON error when the LTA client fails

#### Scenario: GET /api/cameras
- **WHEN** a client sends `GET /api/cameras`
- **THEN** the response is JSON of type `TrafficCamera[]`

#### Scenario: GET /api/flights
- **WHEN** a client sends `GET /api/flights`
- **THEN** the response is JSON of type `FlightState[]`

#### Scenario: GET /api/weather
- **WHEN** a client sends `GET /api/weather`
- **THEN** the response is JSON of type `WeatherData`

#### Scenario: GET /api/news
- **WHEN** a client sends `GET /api/news`
- **THEN** the response is JSON of type `NewsItem[]`

### Requirement: Response shape stability
The system SHALL preserve the JSON shape of every successful and error response emitted by the six route handlers so that the existing React client (`app/page.tsx` and `app/components/*`) requires no changes.

#### Scenario: Pre-change and post-change success bodies are equal
- **WHEN** the same upstream data is available before and after the change
- **THEN** the JSON body returned by each of the six `GET` endpoints is byte-equal to the pre-change body

#### Scenario: Pre-change and post-change error bodies are equal
- **WHEN** a route handler fails with the same upstream condition before and after the change
- **THEN** the JSON body and HTTP status of the error response are byte-equal to the pre-change error response
