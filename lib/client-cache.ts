type CacheEntry<T> = {
  data: T;
  expiry: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = 15 * 1000; // 15 seconds

export async function cachedClientFetch<T>(
  url: string,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(url);

  if (entry && entry.expiry > now) {
    return entry.data as T;
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as T;
  cache.set(url, { data, expiry: now + ttlMs });
  return data;
}
