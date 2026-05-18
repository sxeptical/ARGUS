const cache = new Map<string, { value: unknown; timestamp: number }>();

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

  const value = await loader();
  cache.set(key, { value, timestamp: now });
  return value;
}

export function clearCache(key?: string): void {
  if (key) {
    cache.delete(key);
    return;
  }

  cache.clear();
}
