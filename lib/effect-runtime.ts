/**
 * Shared Effect runtime for the ARGUS server.
 *
 * One `ManagedRuntime` is built at module load per server instance. Route
 * handlers execute against the same Cache, RateLimit, and HttpClient
 * services, so service requirements remain visible to TypeScript instead
 * of being erased with `as unknown as` casts.
 */
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Layer, Logger, LogLevel, ManagedRuntime } from "effect";
import { Cache, CacheLive } from "@/lib/cache";
import { RateLimit, RateLimitLive } from "@/lib/rate-limit";

export type AppContext = Cache | RateLimit | HttpClient.HttpClient;

const loggerLayer = Logger.replace(Logger.defaultLogger, Logger.stringLogger);
const minimumLogLevelLayer = Logger.minimumLogLevel(LogLevel.Warning);

export const appLayer = Layer.mergeAll(
  CacheLive,
  RateLimitLive,
  FetchHttpClient.layer,
  loggerLayer,
  minimumLogLevelLayer,
);

export const runtime = ManagedRuntime.make(appLayer);
