/**
 * In-memory TTL cache with per-key producer deduplication and oldest-entry
 * eviction. State is per instance; the server shares the `cache` singleton.
 */

const MAX_ENTRIES = 500;

type CacheEntry = { value: unknown; timestamp: number };

export function createCache() {
  const entries = new Map<string, CacheEntry>();
  // Concurrent callers await the same producer promise.
  const inFlight = new Map<string, Promise<unknown>>();

  const store = (key: string, value: unknown): void => {
    if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
      let oldestKey = "";
      let oldest = Infinity;
      for (const [entryKey, entry] of entries) {
        if (entry.timestamp < oldest) {
          oldest = entry.timestamp;
          oldestKey = entryKey;
        }
      }
      entries.delete(oldestKey);
    }
    entries.set(key, { value, timestamp: Date.now() });
  };

  return {
    /** Return a fresh value, or run `producer` once and cache its result. */
    get<A>(key: string, ttlMs: number, producer: () => Promise<A>): Promise<A> {
      const current = entries.get(key);
      if (current && Date.now() - current.timestamp < ttlMs) {
        return Promise.resolve(current.value as A);
      }

      const pending = inFlight.get(key) as Promise<A> | undefined;
      if (pending) return pending;

      // Failures are not cached: the entry is dropped so the next call retries.
      const run: Promise<A> = Promise.resolve()
        .then(producer)
        .then((value) => {
          store(key, value);
          return value;
        })
        .finally(() => {
          if (inFlight.get(key) === run) inFlight.delete(key);
        });
      inFlight.set(key, run);
      return run;
    },

    set(key: string, value: unknown): void {
      store(key, value);
    },

    /** Read a fresh value without running or caching a producer. */
    peek<A>(key: string, maxAgeMs: number): A | null {
      const entry = entries.get(key);
      if (!entry || Date.now() - entry.timestamp >= maxAgeMs) return null;
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
