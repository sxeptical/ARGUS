/**
 * In-memory TTL cache exposed as an Effect `Cache` service.
 *
 * Behavior is identical to the pre-change `cachedFetch` / `setCachedValue`:
 *  - Entries live for `ttlMs` from their write timestamp.
 *  - Concurrent calls for the same key share one in-flight producer
 *    (de-duplicated via `Effect.cached`).
 *  - When the map reaches `MAX_ENTRIES`, the oldest entry is evicted.
 *
 * The underlying state is held in a `Ref` so the service is fully injectable
 * via `Layer`. A `CacheLive` layer is exported for production use; tests
 * provide a custom `Layer.succeed(Cache, ...)` instead.
 */
import { Context, Effect, Layer, Ref } from "effect";

const MAX_ENTRIES = 500;

type CacheEntry = { value: unknown; timestamp: number };

export interface Cache {
  readonly get: <A, E, R>(
    key: string,
    ttlMs: number,
    producer: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E, R>;
  readonly set: <A>(key: string, value: A) => Effect.Effect<void>;
  readonly clear: (key?: string) => Effect.Effect<void>;
}

export const Cache = Context.GenericTag<Cache>("@argus/Cache");

interface CacheState {
  entries: Map<string, CacheEntry>;
}

const evictOldest = (entries: Map<string, CacheEntry>): void => {
  if (entries.size < MAX_ENTRIES) return;
  let oldestKey = "";
  let oldest = Infinity;
  for (const [key, entry] of entries) {
    if (entry.timestamp < oldest) {
      oldest = entry.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey) entries.delete(oldestKey);
};

const make = Effect.gen(function* () {
  const state = yield* Ref.make<CacheState>({ entries: new Map() });

  const get: Cache["get"] = <A, E, R>(
    key: string,
    ttlMs: number,
    producer: Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      const now = Date.now();
      const current = (yield* Ref.get(state)).entries.get(key);
      if (current && now - current.timestamp < ttlMs) {
        return current.value as A;
      }

      // `Effect.cached` de-duplicates concurrent runs of the same producer
      // by memoizing the resulting Effect. Two callers invoking `get` with
      // the same key while a producer is running share one execution.
      const memoized = yield* Effect.cached(producer);
      const value = (yield* memoized) as A;

      yield* Ref.update(state, (s) => {
        evictOldest(s.entries);
        s.entries.set(key, { value, timestamp: Date.now() });
        return s;
      });

      return value;
    });

  const set: Cache["set"] = (key, value) =>
    Ref.update(state, (s) => {
      evictOldest(s.entries);
      s.entries.set(key, { value, timestamp: Date.now() });
      return s;
    });

  const clear: Cache["clear"] = (key) =>
    Ref.update(state, (s) => {
      if (key) {
        s.entries.delete(key);
      } else {
        s.entries.clear();
      }
      return s;
    });

  return { get, set, clear } satisfies Cache;
});

export const CacheLive: Layer.Layer<Cache, never, never> = Layer.effect(Cache, make);

// ---------- Legacy Promise-based API (transitional) ----------
//
// `lib/api-clients.ts` still uses the pre-change `cachedFetch` and
// `setCachedValue` shape. These will be removed in tasks 5.x when the data
// sources are rewritten as Effect programs. Until then, the legacy functions
// share the same module-level state shape (LRU + in-flight de-dup).

const legacyEntries = new Map<string, { value: unknown; timestamp: number }>();
const legacyInFlight = new Map<string, Promise<unknown>>();

function legacyEvictOldest(): void {
  if (legacyEntries.size < MAX_ENTRIES) return;
  let oldestKey = "";
  let oldest = Infinity;
  for (const [key, entry] of legacyEntries) {
    if (entry.timestamp < oldest) {
      oldest = entry.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey) legacyEntries.delete(oldestKey);
}

export async function cachedFetch<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const now = Date.now();
  const current = legacyEntries.get(key);
  if (current && now - current.timestamp < ttlMs) {
    return current.value as T;
  }

  const pending = legacyInFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = loader()
    .then((value) => {
      legacyEvictOldest();
      legacyEntries.set(key, { value, timestamp: Date.now() });
      return value;
    })
    .finally(() => {
      legacyInFlight.delete(key);
    });

  legacyInFlight.set(key, request);
  return request;
}

export function setCachedValue<T>(key: string, value: T): void {
  legacyEvictOldest();
  legacyEntries.set(key, { value, timestamp: Date.now() });
}

export function clearCache(key?: string): void {
  if (key) {
    legacyEntries.delete(key);
    legacyInFlight.delete(key);
    return;
  }
  legacyEntries.clear();
  legacyInFlight.clear();
}
