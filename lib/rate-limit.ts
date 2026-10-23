/** Per-IP rate limiter with bounded window storage and atomic `Ref` updates. */
import { Context, Effect, Layer, Ref } from "effect";

const DEFAULT_WINDOW_MS = 60 * 1000;
const GLOBAL_MAX_REQUESTS = 300;
const MAX_ENTRIES = 10_000;

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetMs: number;
}

export interface RateLimitOptions {
  readonly maxRequests?: number;
  readonly windowMs?: number;
  readonly scope?: string;
}

export interface RateLimit {
  readonly check: (
    ip: string,
    options?: RateLimitOptions,
  ) => Effect.Effect<RateLimitDecision>;
}

export const RateLimit = Context.GenericTag<RateLimit>("@argus/RateLimit");

interface WindowEntry {
  count: number;
  windowStart: number;
}

interface WindowState {
  ipWindows: Map<string, WindowEntry>;
}

// Never evict the current key: doing so would reset its request count.
const evictOldestIfNeeded = (
  windows: Map<string, WindowEntry>,
  currentKey: string,
): void => {
  if (windows.size < MAX_ENTRIES) return;
  let oldestKey = "";
  let oldest = Infinity;
  for (const [key, entry] of windows) {
    if (key !== currentKey && entry.windowStart < oldest) {
      oldest = entry.windowStart;
      oldestKey = key;
    }
  }
  if (oldestKey) windows.delete(oldestKey);
};

const make = Effect.gen(function* () {
  const state = yield* Ref.make<WindowState>({ ipWindows: new Map() });

  const check: RateLimit["check"] = (ip, options = {}) =>
    Effect.gen(function* () {
      const maxRequests = options.maxRequests ?? GLOBAL_MAX_REQUESTS;
      const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
      const scope = options.scope ?? "global";
      const key = `${scope}:${ip}`;

      const now = Date.now();

      return yield* Ref.modify(state, (s) => {
        evictOldestIfNeeded(s.ipWindows, key);
        const entry = s.ipWindows.get(key);
        if (!entry || now - entry.windowStart > windowMs) {
          s.ipWindows.set(key, { count: 1, windowStart: now });
          return [
            {
              allowed: true,
              remaining: maxRequests - 1,
              resetMs: windowMs,
            } satisfies RateLimitDecision,
            s,
          ] as const;
        }
        entry.count += 1;
        const remaining = Math.max(0, maxRequests - entry.count);
        const resetMs = Math.max(0, entry.windowStart + windowMs - now);
        return [
          {
            allowed: entry.count <= maxRequests,
            remaining,
            resetMs,
          } satisfies RateLimitDecision,
          s,
        ] as const;
      });
    });

  return { check } satisfies RateLimit;
});

export const RateLimitLive: Layer.Layer<RateLimit, never, never> = Layer.effect(
  RateLimit,
  make,
);

/**
 * Trust Vercel's forwarding header on Vercel, or standard proxy headers only
 * when `ARGUS_TRUST_PROXY_HEADERS=true`. Otherwise share an `"unknown"` bucket
 * to prevent clients spoofing separate rate limits. Trusted requests without
 * headers fall back to localhost. `x-vercel-forwarded-for` is ignored off
 * Vercel, where clients can set it themselves.
 */
export function extractClientIp(request: Request): string {
  const onVercel = process.env.VERCEL === "1";
  const trustProxy = process.env.ARGUS_TRUST_PROXY_HEADERS === "true";

  if (onVercel) {
    const vercelForwarded = request.headers.get("x-vercel-forwarded-for");
    if (vercelForwarded) return vercelForwarded.split(",")[0].trim();
  }

  if (trustProxy) {
    const realIp = request.headers.get("x-real-ip");
    if (realIp) return realIp.trim();
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim();
  }

  // Untrusted clients share one bucket to prevent spoofed per-IP limits.
  if (!trustProxy) {
    return "unknown";
  }

  return "127.0.0.1";
}
