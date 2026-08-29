/**
 * In-memory TTL cache exposed as an Effect `Cache` service.
 *
 * Behavior:
 *  - Entries live for `ttlMs` from their write timestamp.
 *  - Concurrent calls for the same key share one in-flight producer
 *    (de-duplicated via a per-key Map of memoized Effects).
 *  - When the map reaches `MAX_ENTRIES`, the oldest entry is evicted.
 *
 * The cached entries and the in-flight Map are both constructed inside
 * `make`, so each `CacheLive` instance isolates its own producers. Within
 * an instance the check-then-set is atomic because JavaScript is
 * single-threaded and Effect fibers are cooperatively scheduled.
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
  // Per-instance in-flight registry. Each entry stores the inner Effect of
  // `Effect.cached(producer)`, i.e. the `await Deferred` that callers of
  // *this* cache share. Late joiners `yield*` the same inner and receive
  // the same value. A second CacheLive must not see this map.
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

      // Capture the exit so we can always clean up the in-flight entry
      // even when the producer fails. Previously, a failure skipped the
      // cleanup, permanently poisoning the key on that warm instance.
      const exit = yield* Effect.exit(
        inner as ProducerEffect<A, E, R>,
      );

      // Always clean up the in-flight entry (leader owns cleanup via
      // reflex equality). This ensures failures don't poison the key
      // and the next caller can retry the producer.
      if (inFlight.get(key) === inner) {
        inFlight.delete(key);
      }

      if (exit._tag === "Success") {
        // Only cache successful values — never cache failures.
        yield* Ref.update(state, (s) => {
          evictOldest(s.entries);
          s.entries.set(key, { value: exit.value, timestamp: Date.now() });
          return s;
        });
        return exit.value;
      }

      // Propagate the failure without caching it. The next call will
      // re-create the producer since inFlight was cleaned up above.
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
