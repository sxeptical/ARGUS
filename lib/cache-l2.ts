/**
 * Optional L2 cache shared by all isolates in the same Cloudflare location.
 *
 * Uses the Workers Cache API, which needs no account resources (unlike KV) and
 * is colo-local. Values are JSON blobs, so callers opt in per key and must pass
 * a codec for Map/Set-like values. Negative entries are never written: the L1
 * cache already bounds upstream retries to seconds.
 * https://developers.cloudflare.com/workers/runtime-apis/cache/
 */

/** Minimal structural view of the Workers Cache API, injectable in tests. */
export interface CacheL2Storage {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

export interface CacheL2 {
  /** Returns `undefined` on miss, expiry, or any storage/parse error. */
  get(key: string): Promise<unknown | undefined>;
  /** Best-effort write; never throws and skips oversized values. */
  put(key: string, value: unknown, ttlMs: number): Promise<void>;
}

/** Cache keys are per Worker; this host never receives real traffic. */
const CACHE_ORIGIN = "https://l2.argus-cache.internal/";

/** Bump when a shared value's shape changes to orphan old entries. */
const CACHE_KEY_VERSION = "v1";

/**
 * Conservative cap well below the Cache API object limit. BusRouter geometry
 * is deliberately not eligible (it is tens of MB), and BusStops/BusRoutes fit.
 */
const MAX_L2_VALUE_BYTES = 4 * 1024 * 1024;

export function createCacheApiL2(
  storage?: CacheL2Storage | null,
  options: { maxBytes?: number } = {},
): CacheL2 | null {
  const cache = storage ?? getDefaultCache();
  if (!cache) return null;
  const maxBytes = options.maxBytes ?? MAX_L2_VALUE_BYTES;

  const requestForKey = (key: string): Request =>
    new Request(
      new URL(`${CACHE_KEY_VERSION}/${encodeURIComponent(key)}`, CACHE_ORIGIN),
      { method: "GET" },
    );

  return {
    async get(key) {
      try {
        const response = await cache.match(requestForKey(key));
        if (!response) return undefined;
        return (await response.json()) as unknown;
      } catch {
        // Treat a corrupt entry or unavailable cache as a miss.
        return undefined;
      }
    },

    async put(key, value, ttlMs) {
      // `Infinity` (cache.set) has no meaningful Cache API TTL.
      if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
      try {
        const body = JSON.stringify(value);
        // UTF-16 length is a conservative byte estimate for ASCII JSON.
        if (body.length > maxBytes) return;
        const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
        await cache.put(
          requestForKey(key),
          new Response(body, {
            headers: {
              "content-type": "application/json",
              "cache-control": `public, max-age=${ttlSeconds}`,
            },
          }),
        );
      } catch {
        // L2 is best effort; the L1 cache and producer still work.
      }
    },
  };
}

/** `caches.default` exists in Workers but not in Node/Bun test runs. */
function getDefaultCache(): CacheL2Storage | null {
  const storage = (
    globalThis as { caches?: { default?: CacheL2Storage } }
  ).caches;
  return storage?.default ?? null;
}
