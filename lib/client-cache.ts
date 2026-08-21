type CacheEntry<T> = {
  data: T;
  expiry: number;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 15 * 1000; // 15 seconds

// Bounded cache: expired entries are pruned on every insert, and a hard cap
// evicts oldest-inserted entries so a long session browsing many unique URLs
// (e.g. every bus stop) cannot grow the map indefinitely.
const MAX_ENTRIES = 500;

function pruneCache(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiry <= now) cache.delete(key);
  }
}

export async function cachedClientFetch<T>(
  url: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(url);

  if (entry && entry.expiry > now) {
    return entry.data as T;
  }

  const pending = inFlight.get(url);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = fetch(url, { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as T;
      const insertAt = Date.now();
      pruneCache(insertAt);
      while (cache.size >= MAX_ENTRIES) {
        // Map iteration is insertion-ordered; the first key is the oldest.
        const oldestKey = cache.keys().next().value;
        if (oldestKey === undefined) break;
        cache.delete(oldestKey);
      }
      cache.set(url, { data, expiry: insertAt + ttlMs });
      return data;
    })
    .finally(() => {
      inFlight.delete(url);
    });

  inFlight.set(url, request);
  return request;
}
