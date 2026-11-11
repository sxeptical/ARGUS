/**
 * Cross-isolate rate limiting. On Workers the native Rate Limiting binding is
 * shared by every isolate in the same Cloudflare location, which removes the
 * "limit × isolate count" problem of the in-memory limiter. The binding is
 * eventually consistent and per-location, so it is an approximation; when it is
 * unavailable (tests, `next dev`, missing binding) or throws, we fall back to
 * the isolate-local limiter.
 *
 * The binding fixes its threshold at deploy time, so routes with different
 * budgets map to one of a few bindings by `maxRequests`.
 * https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  rateLimiter,
  type RateLimitDecision,
  type RateLimitOptions,
} from "@/lib/rate-limit";

/** One minute is the only useful native period for these per-minute budgets. */
const SHARED_WINDOW_MS = 60_000;

interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface SharedRateLimitBackend {
  /**
   * Returns whether the request is allowed. Must throw when the backend is
   * unusable so the caller can fall back to the local limiter.
   */
  limit(key: string, options: { maxRequests: number }): Promise<boolean>;
}

export interface SharedRateLimitLimiter {
  check(ip: string, options?: RateLimitOptions): Promise<RateLimitDecision>;
}

const LIMIT_BINDINGS = [
  { maxRequests: 60, name: "RATE_LIMITER_60" },
  { maxRequests: 90, name: "RATE_LIMITER_90" },
  { maxRequests: 120, name: "RATE_LIMITER_120" },
  { maxRequests: 300, name: "RATE_LIMITER_300" },
] as const;

/**
 * Pick the largest deployed limit not above the requested budget. Unknown
 * budgets (e.g. 75) use the next lower binding, so the shared limit may be
 * slightly stricter but never exceeds the route's intended budget.
 */
export function bindingNameForLimit(maxRequests: number): string {
  let name: string = LIMIT_BINDINGS[0].name;
  for (const binding of LIMIT_BINDINGS) {
    if (maxRequests >= binding.maxRequests) name = binding.name;
  }
  return name;
}

/** Adapt a Worker `env` to the backend interface; throws on a missing binding. */
export function createRateLimitBackend(
  env: Partial<Record<string, RateLimitBinding | undefined>>,
): SharedRateLimitBackend {
  return {
    async limit(key, options) {
      const binding = env[bindingNameForLimit(options.maxRequests)];
      if (!binding) {
        throw new Error(
          `Rate limiting binding ${bindingNameForLimit(options.maxRequests)} is not configured`,
        );
      }
      const { success } = await binding.limit({ key });
      return success;
    },
  };
}

/**
 * Build a shared limiter around a local fallback. `resolveBackend` runs once so
 * an unavailable backend does not add a context lookup to every request.
 */
export function createSharedRateLimiter(
  local: { check(ip: string, options?: RateLimitOptions): RateLimitDecision },
  resolveBackend: () => SharedRateLimitBackend | null,
): SharedRateLimitLimiter {
  let backend: SharedRateLimitBackend | null | undefined;
  let warned = false;

  return {
    async check(ip, options = {}) {
      if (backend === undefined) {
        try {
          backend = resolveBackend();
        } catch {
          backend = null;
        }
      }

      const maxRequests = options.maxRequests ?? 300;
      const key = `${options.scope ?? "global"}:${ip}`;

      if (backend) {
        try {
          const allowed = await backend.limit(key, { maxRequests });
          // The native binding only reports success/failure. On denial report
          // the full window, which is a safe upper bound for Retry-After.
          return {
            allowed,
            remaining: 0,
            resetMs: allowed ? 0 : SHARED_WINDOW_MS,
          };
        } catch (error) {
          // Fail open to the in-memory limiter rather than dropping traffic.
          if (!warned) {
            warned = true;
            console.warn(
              `[rate-limit] shared limiter unavailable, using local fallback: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }
      }

      return local.check(ip, options);
    },
  };
}

/** Cloudflare context is only present inside a Workers request. */
function resolveCloudflareBackend(): SharedRateLimitBackend | null {
  try {
    const { env } = getCloudflareContext();
    const bindings = {
      RATE_LIMITER_60: env.RATE_LIMITER_60,
      RATE_LIMITER_90: env.RATE_LIMITER_90,
      RATE_LIMITER_120: env.RATE_LIMITER_120,
      RATE_LIMITER_300: env.RATE_LIMITER_300,
    };
    // A partially configured deployment still benefits from the bindings that
    // exist; a missing one throws in `createRateLimitBackend.limit`.
    return Object.values(bindings).some(Boolean)
      ? createRateLimitBackend(bindings)
      : null;
  } catch {
    // No request context (tests, plain `next dev`) — use in-memory state.
    return null;
  }
}

export const sharedRateLimiter = createSharedRateLimiter(
  rateLimiter,
  resolveCloudflareBackend,
);
