/**
 * Shared route handler helper for the ARGUS server.
 *
 * Every route handler is a one-liner: `export const GET = (request) =>
 * handle(request, "scope", { maxRequests: 60 }, producer)`. The helper:
 *  1. Runs the rate-limit check, returning a 429 if exceeded.
 *  2. Runs the producer Effect through the shared runtime.
 *  3. Maps the success value to a 200 JSON response.
 *  4. Maps each `AppError` tag to the right HTTP status, preserving the
 *     JSON shapes and headers the pre-change `getExternalApiErrorResponse`
 *     helper emitted.
 */
import { Effect } from "effect";
import { runtime } from "@/lib/effect-runtime";
import { extractClientIp } from "@/lib/rate-limit";
import { RateLimit } from "@/lib/rate-limit";
import { ExternalApiError, SchemaParseError, TimeoutError } from "@/lib/errors";

export type RateLimitDecision = import("@/lib/rate-limit").RateLimitDecision;
export type RateLimitOptions = import("@/lib/rate-limit").RateLimitOptions;
export { extractClientIp };

// 5-digit LTA bus stop code, as accepted by the LTA BusArrival endpoint.
export const BUS_STOP_ID_RE = /^\d{5}$/;

type AppError = ExternalApiError | SchemaParseError | TimeoutError;

const errorToResponse = (
  error: AppError,
  serviceLabel: string,
): Response => {
  if (error._tag === "ExternalApiError") {
    const headers: Record<string, string> = {};
    if (error.status === 429) {
      headers["Retry-After"] = "60";
    }
    // 4xx (including 429) -> 503 (we treat the upstream as "temporarily
    // unavailable" since the request itself was well-formed); 5xx -> 502;
    // anything else -> 503 as a safe default.
    const status =
      error.status >= 500 ? 502 : 503;
    return Response.json(
      { error: `${serviceLabel} is temporarily unavailable` },
      { status, headers },
    );
  }
  if (error._tag === "TimeoutError") {
    return Response.json(
      { error: `${serviceLabel} timed out` },
      { status: 504 },
    );
  }
  // SchemaParseError
  return Response.json(
    { error: `${serviceLabel} returned an unexpected response` },
    { status: 502 },
  );
};

export async function handle<A, R>(
  request: Request,
  scope: string,
  options: { maxRequests?: number; windowMs?: number; serviceLabel: string },
  program: Effect.Effect<A, AppError, R>,
): Promise<Response> {
  const ip = extractClientIp(request);

  // Run the rate-limit check on the shared runtime. If the runtime itself
  // fails (e.g. layer construction error, fiber cancellation) we return 500
  // rather than letting the unhandled rejection crash the server process.
  let decision: import("@/lib/rate-limit").RateLimitDecision;
  try {
    decision = await runtime.runPromise(
      Effect.gen(function* () {
        const rl = yield* RateLimit;
        return yield* rl.check(ip, {
          scope,
          maxRequests: options.maxRequests,
          windowMs: options.windowMs,
        });
      }),
    );
  } catch (error) {
    console.error(`[${scope}] rate-limit check failed`, error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  if (!decision.allowed) {
    const retryAfterSeconds = Math.max(1, Math.ceil(decision.resetMs / 1000));
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfterSeconds),
          "X-RateLimit-Remaining": String(decision.remaining),
          "X-RateLimit-Reset": String(Date.now() + decision.resetMs),
        },
      },
    );
  }

  try {
    const exit = await runtime.runPromiseExit(
      program as Effect.Effect<A, AppError, never>,
    );
    if (exit._tag === "Success") {
      return Response.json(exit.value);
    }
    const cause = exit.cause;
    if (cause._tag === "Fail") {
      const failure = cause.error;
      if (failure instanceof ExternalApiError) {
        return errorToResponse(failure, options.serviceLabel);
      }
      if (failure instanceof SchemaParseError) {
        return errorToResponse(failure, options.serviceLabel);
      }
      if (failure instanceof TimeoutError) {
        return errorToResponse(failure, options.serviceLabel);
      }
      console.error(`[${scope}] unhandled failure`, failure);
    } else {
      console.error(`[${scope}] unhandled cause`, cause);
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  } catch (error) {
    console.error(`[${scope}] unhandled error`, error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
