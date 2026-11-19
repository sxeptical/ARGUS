/**
 * In-memory TTL cache with per-key producer deduplication, short negative
 * caching for failures, and oldest-entry eviction. State is per instance; the
 * server shares the `cache` singleton.
 */
import { ExternalApiError } from "@/lib/errors";

const MAX_ENTRIES = 500;
/** Failed producers are re-thrown for this long instead of retrying at once. */
const NEGATIVE_TTL_MS = 10_000;
/** Upper bound for a negative cache window, including upstream rate limits. */
const NEGATIVE_TTL_MAX_MS = 60_000;

interface CacheEntry {
  readonly value?: unknown;
  readonly error?: unknown;
  readonly failed: boolean;
  readonly timestamp: number;
  readonly ttlMs: number;
}

export interface CacheGetOptions<A> {
  /**
   * Aborts only this caller's wait, never the shared producer. Concurrent
   * callers keep the in-flight producer alive and can still populate the
   * cache, even if one request disconnects.
   */
  readonly signal?: AbortSignal;
  /** Override the negative-cache window for this key (capped at 60s). */
  readonly negativeTtlMs?: number;
  /** Choose a shorter TTL for partial results. */
  readonly ttlForValue?: (value: A) => number;
}

/** Reject when `signal` aborts without cancelling the shared `promise`. */
const waitFor = <A>(promise: Promise<A>, signal?: AbortSignal): Promise<A> => {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<A>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
};

const negativeTtlFor = (error: unknown, override?: number): number => {
  const ttl =
    override ??
    (error instanceof ExternalApiError && error.status === 429
      ? NEGATIVE_TTL_MAX_MS
      : NEGATIVE_TTL_MS);
  return Math.min(ttl, NEGATIVE_TTL_MAX_MS);
};

export function createCache() {
  const entries = new Map<string, CacheEntry>();
  // Concurrent callers await the same producer promise.
  const inFlight = new Map<string, Promise<unknown>>();

  const store = (
    key: string,
    entry: Omit<CacheEntry, "timestamp">,
  ): void => {
    if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
      let oldestKey = "";
      let oldest = Infinity;
      for (const [entryKey, cached] of entries) {
        if (cached.timestamp < oldest) {
          oldest = cached.timestamp;
          oldestKey = entryKey;
        }
      }
      entries.delete(oldestKey);
    }
    entries.set(key, { ...entry, timestamp: Date.now() });
  };

  return {
    /**
     * Return a fresh value, or run `producer` once and cache its result.
     * Failures are cached briefly so a down upstream is not retried by every
     * request; the original error object (and type) is re-thrown.
     */
    get<A>(
      key: string,
      ttlMs: number,
      producer: () => Promise<A>,
      options: CacheGetOptions<A> = {},
    ): Promise<A> {
      const current = entries.get(key);
      // A negative entry uses its own short TTL; a success also honours the
      // caller's TTL cap (and `set` entries stay open-ended unless capped).
      const currentTtl = current?.failed
        ? current.ttlMs
        : Math.min(current?.ttlMs ?? 0, ttlMs);
      if (current && Date.now() - current.timestamp < currentTtl) {
        return current.failed
          ? Promise.reject(current.error)
          : Promise.resolve(current.value as A);
      }

      const pending = inFlight.get(key) as Promise<A> | undefined;
      if (pending) return waitFor(pending, options.signal);

      // Async wrapper so a producer that throws synchronously still rejects.
      const run: Promise<A> = (async () => producer())()
        .then(
          (value) => {
            const entryTtl = options.ttlForValue
              ? options.ttlForValue(value)
              : ttlMs;
            store(key, { failed: false, value, ttlMs: entryTtl });
            return value;
          },
          (error: unknown) => {
            store(key, {
              failed: true,
              error,
              ttlMs: negativeTtlFor(error, options.negativeTtlMs),
            });
            throw error;
          },
        )
        .finally(() => {
          if (inFlight.get(key) === run) inFlight.delete(key);
        });
      inFlight.set(key, run);
      return waitFor(run, options.signal);
    },

    set(key: string, value: unknown): void {
      store(key, { failed: false, value, ttlMs: Number.POSITIVE_INFINITY });
    },

    /** Read a fresh value without running or caching a producer. */
    peek<A>(key: string, maxAgeMs: number): A | null {
      const entry = entries.get(key);
      if (!entry || entry.failed) return null;
      if (Date.now() - entry.timestamp >= maxAgeMs) return null;
      return entry.value as A;
    },

    clear(key?: string): void {
      if (key) {
        entries.delete(key);
        inFlight.delete(key);
      } else {
        entries.clear();
        inFlight.clear();
      }
    },
  };
}

export const cache = createCache();
