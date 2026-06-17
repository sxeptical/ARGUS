## ADDED Requirements

### Requirement: TTL cache service
The system SHALL expose a `Cache` Effect service with a `get` method that takes a key, a Time-To-Live in milliseconds, and an `Effect` producer. The service SHALL return a value from the in-memory map if the cached entry is younger than the TTL. The service SHALL de-duplicate concurrent calls for the same key by returning the in-flight `Effect` to subsequent callers. The service SHALL evict the oldest entry when the in-memory map exceeds 500 entries. The service SHALL expose a `set` method that writes a value with the current timestamp. Both methods SHALL be safe to call concurrently.

#### Scenario: Cache miss triggers producer
- **WHEN** `Cache.get` is called for a key that is not in the map
- **THEN** the producer Effect is run, its result is stored in the map with the current timestamp, and the result is returned to the caller

#### Scenario: Cache hit returns stored value
- **WHEN** `Cache.get` is called for a key whose entry is younger than the TTL
- **THEN** the stored value is returned without invoking the producer

#### Scenario: Concurrent calls de-duplicate
- **WHEN** two callers invoke `Cache.get` for the same key while no entry is in the map and no in-flight Effect exists
- **THEN** only one producer Effect is run, and both callers receive the same result

#### Scenario: LRU eviction at capacity
- **WHEN** `Cache.get` or `Cache.set` is called and the in-memory map already has 500 entries
- **THEN** the entry with the oldest timestamp is evicted before the new entry is stored

#### Scenario: TTL expiry
- **WHEN** `Cache.get` is called for a key whose entry is older than the TTL
- **THEN** the entry is treated as a miss and the producer is run again

### Requirement: Rate limit service
The system SHALL expose a `RateLimit` Effect service with a `check` method that takes an IP, a scope string, a max request count, and a window length in milliseconds. The service SHALL return a `RateLimitDecision` containing `allowed`, `remaining`, and `resetMs`. The default global configuration SHALL be 300 requests per 60 seconds per `(scope, ip)` pair. The service SHALL evict the oldest entry when the per-IP window map exceeds 10,000 entries. The service SHALL be safe to call concurrently.

#### Scenario: First request in a window
- **WHEN** `RateLimit.check` is called for an IP that has not made a request in the current window
- **THEN** the response has `allowed = true`, `remaining = max - 1`, and `resetMs = windowMs`

#### Scenario: Subsequent requests within the window
- **WHEN** `RateLimit.check` is called again for the same IP within the window
- **THEN** the response has `allowed = true` while the count is below the max, with `remaining` decreasing by one each call

#### Scenario: Limit exceeded
- **WHEN** `RateLimit.check` is called and the per-IP count exceeds the max
- **THEN** the response has `allowed = false`, `remaining = 0`, and `resetMs` equal to the time remaining in the current window

#### Scenario: Window has rolled over
- **WHEN** `RateLimit.check` is called and the per-IP window start is older than `windowMs` ago
- **THEN** the count is reset to 1 and a new window begins

### Requirement: Service layers
The system SHALL provide a `Cache.Default` layer and a `RateLimit.Default` layer that wire the in-memory implementations to the service tags. The system SHALL provide a top-level `appLayer` that combines `Cache.Default`, `RateLimit.Default`, `HttpClient` (Fetch implementation), `NodeContext`, and the default `Logger` with a minimum log level of `LogLevel.Warning`. The system SHALL provide a `runtime = ManagedRuntime.make(appLayer)` exported from `lib/effect-runtime.ts` for use by route handlers.

#### Scenario: Building the runtime succeeds
- **WHEN** `lib/effect-runtime.ts` is imported
- **THEN** the module exposes a `runtime` of type `ManagedRuntime<AppContext, never>` and importing it does not throw

#### Scenario: A route handler can resolve `Cache` and `RateLimit`
- **WHEN** a route handler yields `Cache` or `RateLimit` from the runtime
- **THEN** the call resolves to the `Default` implementation without a missing-service error
