/**
 * In-memory TTL cache exposed as an Effect `Cache` service.
 *
 * Behavior:
 *  - Entries live for `ttlMs` from their write timestamp.
 *  - Concurrent calls for the same key share one in-flight producer
 *    (de-duplicated via a per-key Map of memoized Effects).
 *  - When the map reaches `MAX_ENTRIES`, the oldest entry is evicted.
 *
 * The cached entries are held in an Effect `Ref` so the service is fully
 * injectable via `Layer`. The in-flight Map is module-level; it is safe
 * because JavaScript is single-threaded and Effect fibers are cooperatively
 * scheduled, so the check-then-set sequence below is atomic with respect
 * to other fibers.
 *
 * A `CacheLive` layer is exported for production use; tests provide a
 * custom `Layer.succeed(Cache, ...)` instead.
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
  readonly clear: (key?: string) => Effect.Effect<void>;
}

export const Cache = Context.GenericTag<Cache>("@argus/Cache");

interface CacheState {
  entries: Map<string, CacheEntry>;
}

// Module-level in-flight registry. Each entry stores the inner Effect of
// `Effect.cached(producer)`, i.e. the `await Deferred` that all callers share.
// Late joiners `yield*` the same inner and receive the same value.
const inFlight = new Map<string, ProducerEffect<unknown, unknown, unknown>>();

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
    producer: ProducerEffect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      const now = Date.now();
      const current = (yield* Ref.get(state)).entries.get(key);
      if (current && now - current.timestamp < ttlMs) {
        return current.value as A;
      }

      // Atomic in JavaScript: the check-then-set below has no yield between
      // it. If a slot already exists, the second caller reuses it. If not,
      // this caller becomes the leader and the `Effect.cached(producer)` it
      // builds is stored in the map.
      let inner = inFlight.get(key);
      if (!inner) {
        const outer = Effect.cached(producer);
        // First caller materializes the outer Effect to get the inner. The
        // outer runs once and forks the producer into a Deferred; the
        // returned inner is `await Deferred`. We store the inner so any
        // subsequent caller that arrives while the producer is still
        // running yields the same inner and receives the same value.
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

      const value = (yield* (inner as ProducerEffect<A, E, R>)) as A;

      yield* Ref.update(state, (s) => {
        evictOldest(s.entries);
        s.entries.set(key, { value, timestamp: Date.now() });
        return s;
      });

      // Only clear the slot if it is still ours. A later caller may have
      // replaced it after the cache expired while the producer was running.
      if (inFlight.get(key) === inner) {
        inFlight.delete(key);
      }

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
        inFlight.delete(key);
      } else {
        s.entries.clear();
        inFlight.clear();
      }
      return s;
    });

  return { get, set, clear } satisfies Cache;
});

export const CacheLive: Layer.Layer<Cache, never, never> = Layer.effect(Cache, make);

