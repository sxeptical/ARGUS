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

// ---------- Legacy sync API (transitional) ----------
//
// `lib/route-utils.ts` still imports the pre-change `checkGlobalRateLimit`
// and `extractClientIp`. These are kept until tasks 6.x rewrite the route
// utility on top of the new service.

export function checkGlobalRateLimit(
  ip: string,
  maxRequests: number = GLOBAL_MAX_REQUESTS,
  windowMs: number = DEFAULT_WINDOW_MS,
  scope: string = "global",
): { allowed: boolean; remaining: number; resetMs: number } {
  const state: WindowState = { ipWindows: ipWindowsLegacy };
  const now = Date.now();
  const key = `${scope}:${ip}`;
  evictOldestIfNeeded(state.ipWindows);
  const entry = state.ipWindows.get(key);
  if (!entry || now - entry.windowStart > windowMs) {
    state.ipWindows.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, resetMs: windowMs };
  }
  entry.count += 1;
  const remaining = Math.max(0, maxRequests - entry.count);
  const resetMs = Math.max(0, entry.windowStart + windowMs - now);
  return { allowed: entry.count <= maxRequests, remaining, resetMs };
}

const ipWindowsLegacy = new Map<string, WindowEntry>();

export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  return realIp ?? "127.0.0.1";
}
