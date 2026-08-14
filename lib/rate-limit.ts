/**
 * Per-IP sliding-window rate limiter exposed as an Effect `RateLimit` service.
 *
 * The implementation is a direct port of the pre-change
 * `checkGlobalRateLimit` function: a `Map<scope:ip, { count, windowStart }>`
 * with a 10,000-entry LRU cap. Calls are atomic at the `Ref.modify` boundary.
 *
 * The service is wrapped in a `Layer` so tests can substitute a fake.
 */
import { Context, Effect, Layer, Ref } from "effect";

const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minute
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

const evictOldestIfNeeded = (windows: Map<string, WindowEntry>): void => {
  if (windows.size < MAX_ENTRIES) return;
  let oldestKey = "";
  let oldest = Infinity;
  for (const [key, entry] of windows) {
    if (entry.windowStart < oldest) {
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
        evictOldestIfNeeded(s.ipWindows);
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
 * Extract the originating client IP from the request. Header priority:
 *
 * 1. When running on Vercel (`VERCEL=1`), `x-vercel-forwarded-for` — set and
 *    overwritten by Vercel's edge, so it cannot be spoofed by the client.
 * 2. When `ARGUS_TRUST_PROXY_HEADERS=true`, trust `x-real-ip` and
 *    `x-forwarded-for` (standard proxy headers). Use the first hop (leftmost
 *    value) which is the original client when behind a single trusted proxy.
 * 3. When trust flag is unset/false and not on Vercel, fall back to a single
 *    bucket key `"unknown"` so all untrusted-proxy traffic shares one rate-
 *    limit bucket (intentionally prevents spoofed per-client limits).
 * 4. Falls back to `127.0.0.1` for local/dev requests with no proxy header.
 *
 * `x-vercel-forwarded-for` is ignored unless `VERCEL=1`. On a self-hosted
 * deployment a client can supply that header themselves.
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

  // Self-hosted without the trust flag (or Vercel without its edge header):
  // share one untrusted bucket so clients cannot mint a fresh IP per request.
  if (!trustProxy) {
    return "unknown";
  }

  // Trust-enabled but no header present — local/dev fallback.
  return "127.0.0.1";
}
