/** Server-wide Effect runtime sharing cache, rate-limit, and HTTP services. */
import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Layer, Logger, LogLevel, ManagedRuntime } from "effect";
import { Cache, CacheLive } from "@/lib/cache";
import { RateLimit, RateLimitLive } from "@/lib/rate-limit";

export type AppContext = Cache | RateLimit | HttpClient.HttpClient;

const loggerLayer = Logger.replace(Logger.defaultLogger, Logger.stringLogger);
const minimumLogLevelLayer = Logger.minimumLogLevel(LogLevel.Warning);

const appLayer = Layer.mergeAll(
  CacheLive,
  RateLimitLive,
  FetchHttpClient.layer,
  loggerLayer,
  minimumLogLevelLayer,
);

export const runtime = ManagedRuntime.make(appLayer);
