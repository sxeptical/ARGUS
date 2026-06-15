const MAX_ENTRIES = 500;

const cache = new Map<string, { value: unknown; timestamp: number }>();
const inFlight = new Map<string, Promise<unknown>>();

function evictOldest(): void {
  if (cache.size < MAX_ENTRIES) return;
  let oldestKey = "";
  let oldest = Infinity;
  for (const [key, entry] of cache) {
    if (entry.timestamp < oldest) {
      oldest = entry.timestamp;
      oldestKey = key;
    }
  }
  if (oldestKey) cache.delete(oldestKey);
}

export async function cachedFetch<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const now = Date.now();
  const current = cache.get(key);

  if (current && now - current.timestamp < ttlMs) {
    return current.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const request = loader()
    .then((value) => {
      evictOldest();
      cache.set(key, { value, timestamp: Date.now() });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
}

export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
    inFlight.delete(key);
    return;
  }

  cache.clear();
  inFlight.clear();
}

export function setCachedValue<T>(key: string, value: T): void {
  evictOldest();
  cache.set(key, { value, timestamp: Date.now() });
}
