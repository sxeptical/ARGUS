/**
 * Binding types for code that reads Cloudflare bindings through
 * `getCloudflareContext().env` (see `lib/shared-rate-limit.ts`).
 *
 * `wrangler types` generates a broader file, but its `NodeJS.ProcessEnv`
 * augmentation marks every locally present secret as required (breaking tests
 * that `delete process.env.LTA_API_KEY`) and its runtime types collide with the
 * DOM/Bun libs used by this Next.js app. Keep this list in sync with
 * `wrangler.jsonc` instead.
 */
interface RateLimitBinding {
  /** Shared per-location counter; only success/failure is exposed. */
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface CloudflareEnv {
  RATE_LIMITER_60?: RateLimitBinding;
  RATE_LIMITER_90?: RateLimitBinding;
  RATE_LIMITER_120?: RateLimitBinding;
  RATE_LIMITER_300?: RateLimitBinding;
  ARGUS_TRUST_PROXY_HEADERS?: string;
  LTA_API_KEY?: string;
  AVIATIONSTACK_API_KEY?: string;
}
