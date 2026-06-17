/**
 * Shared Effect runtime for the ARGUS server.
 *
 * One `ManagedRuntime` is built at module-load time per server instance. The
 * route handlers import `runtime` and call `runtime.runPromise(program)` to
 * execute an Effect against the same cached services (`Cache`, `RateLimit`,
 * `HttpClient`).
 *
 * The layer graph is intentionally small:
 *  - `FetchHttpClient.layer` for outbound HTTP (uses `globalThis.fetch`)
 *  - `CacheLive` for the in-memory TTL cache
 *  - `RateLimitLive` for the per-IP rate limiter
 *  - Default `Logger` with `LogLevel.Warning` to keep Vercel logs readable
 *
 * There is no `NodeContext` layer because we never use the file system, RNG,
 * or path services; `FetchHttpClient` works on Node 18+ / 20 / 22 without it.
 */
import { FetchHttpClient } from "@effect/platform";
import { Layer, Logger, LogLevel, ManagedRuntime } from "effect";
import { Cache, CacheLive } from "@/lib/cache";
import { RateLimit, RateLimitLive } from "@/lib/rate-limit";

export type AppContext = Cache | RateLimit;

// The `Logger.replace` call returns a `Layer.Layer<never>` we install
// alongside the other layers. Combined layers are typed loosely to keep the
// public surface clean.
const loggerLayer = Logger.replace(Logger.defaultLogger, Logger.stringLogger);
const minimumLogLevelLayer = Logger.minimumLogLevel(LogLevel.Warning);

export const appLayer = Layer.mergeAll(
  CacheLive,
  RateLimitLive,
  FetchHttpClient.layer,
  loggerLayer,
  minimumLogLevelLayer,
) as unknown as Layer.Layer<AppContext, never, never>;

export const runtime = ManagedRuntime.make(
  appLayer as Layer.Layer<AppContext, never, never>,
);
