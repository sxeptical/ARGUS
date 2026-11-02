/**
 * In-memory TTL cache with per-key producer deduplication and oldest-entry
 * eviction. Cache state and in-flight producers are isolated per layer instance.
 */
import { Context, Effect, Layer, Ref } from "effect";

const MAX_ENTRIES = 500;

type CacheEntry = { value: unknown; timestamp: number };
type ProducerEffect<A, E, R> = Effect.Effect<A, E, R>;

export interface Cache {
  readonly get: <A, E, R>(
    key: string,
    ttlMs: number,
    producer: ProducerEffect<A, E, R>,
  ) => ProducerEffect<A, E, R>;
  readonly set: <A>(key: string, value: A) => Effect.Effect<void>;
  /** Read a fresh value without running or caching a producer. */
  readonly peek: <A>(
    key: string,
    maxAgeMs: number,
  ) => Effect.Effect<A | null>;
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
  // Concurrent callers await the same memoized producer effect.
  const inFlight = new Map<string, ProducerEffect<unknown, unknown, unknown>>();

  const get: Cache["get"] = <A, E, R>(
    key: string,
    ttlMs: number,
    producer: ProducerEffect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      const now = Date.now();
      const current = (yield* Ref.get(state)).entries.get(key);
      if (current && now - current.timestamp < ttlMs) {
        return current.value as A;
      }

      // Register without yielding so callers cannot interleave this check.
      let inner = inFlight.get(key);
      if (!inner) {
        const outer = Effect.cached(producer);
        // Materialize `Effect.cached` once; later callers await this effect.
        inner = (yield* outer) as unknown as ProducerEffect<
          unknown,
          unknown,
          unknown
        >;
        inFlight.set(
          key,
          inner as unknown as ProducerEffect<unknown, unknown, unknown>,
        );
      }

      // Capture failures too so the in-flight entry is always cleaned up.
      const exit = yield* Effect.exit(
        inner as ProducerEffect<A, E, R>,
      );

      // Only the current producer may clear its entry; failures remain retryable.
      if (inFlight.get(key) === inner) {
        inFlight.delete(key);
      }

      if (exit._tag === "Success") {
        yield* Ref.update(state, (s) => {
          evictOldest(s.entries);
          s.entries.set(key, { value: exit.value, timestamp: Date.now() });
          return s;
        });
        return exit.value;
      }

      return yield* Effect.failCause(exit.cause);
    });

  const set: Cache["set"] = (key, value) =>
    Ref.update(state, (s) => {
      evictOldest(s.entries);
      s.entries.set(key, { value, timestamp: Date.now() });
      return s;
    });

  const peek: Cache["peek"] = <A>(key: string, maxAgeMs: number) =>
    Ref.get(state).pipe(
      Effect.map((s) => {
        const entry = s.entries.get(key);
        if (!entry || Date.now() - entry.timestamp >= maxAgeMs) return null;
        return entry.value as A;
      }),
    );

  const clear: Cache["clear"] = (key) =>
    Ref.update(state, (s) => {
      if (key) {
        s.entries.delete(key);
        inFlight.delete(key);
      } else {
        s.entries.clear();
        inFlight.clear();
      }
      return s;
    });

  return { get, set, peek, clear } satisfies Cache;
});

export const CacheLive: Layer.Layer<Cache, never, never> = Layer.effect(Cache, make);
