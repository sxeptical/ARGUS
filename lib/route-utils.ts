/**
 * Shared route handler helper for the ARGUS server.
 *
 * Rate limiting is deliberately the outermost operation: malformed query
 * strings consume the same request budget as valid ones, so validation
 * cannot be used to bypass endpoint throttling. The producer is lazy and is
 * not invoked until the request is allowed.
 */
import { Effect } from "effect";
import { runtime, type AppContext } from "@/lib/effect-runtime";
import { extractClientIp, RateLimit } from "@/lib/rate-limit";
import {
  BadRequestError,
  type AppError,
} from "@/lib/errors";

export type RateLimitDecision = import("@/lib/rate-limit").RateLimitDecision;
export type RateLimitOptions = import("@/lib/rate-limit").RateLimitOptions;
export { extractClientIp };

// 5-digit LTA bus stop code, as accepted by the LTA BusArrival endpoint.
export const BUS_STOP_ID_RE = /^\d{5}$/;

// LTA bus service numbers: digits with optional trailing letter(s), e.g. 12, 12e, NR1.
export const BUS_SERVICE_NO_RE = /^[A-Za-z0-9]{1,8}$/;

type RouteOptions = {
  readonly maxRequests?: number;
  readonly windowMs?: number;
  readonly serviceLabel: string;
};

/** Read and validate a required query parameter, preserving existing errors. */
export function requiredQueryParam(
  request: Request,
  name: string,
  pattern: RegExp,
  requirement: string,
): string {
  const value = new URL(request.url).searchParams.get(name)?.trim() ?? "";
  if (!value) {
    throw new BadRequestError({
      message: `Query param ${name} is required`,
    });
  }
  if (!pattern.test(value)) {
    throw new BadRequestError({
      message: `Query param ${name} ${requirement}`,
    });
  }
  return value;
}

/** Read and validate an optional query parameter. */
export function optionalQueryParam(
  request: Request,
  name: string,
  pattern: RegExp,
  requirement: string,
): string | undefined {
  const value = new URL(request.url).searchParams.get(name)?.trim() || undefined;
  if (value !== undefined && !pattern.test(value)) {
    throw new BadRequestError({
      message: `Query param ${name} ${requirement}`,
    });
  }
  return value;
}

const errorToResponse = (error: AppError, serviceLabel: string): Response => {
  switch (error._tag) {
    case "BadRequestError":
      return Response.json({ error: error.message }, { status: 400 });
    case "ExternalApiError": {
      // Missing server-side API keys are a deployment misconfiguration, not a
      // transient upstream outage. Surface as 500 so ops can distinguish
      // "not configured" from "temporarily unavailable".
      if (
        error.status === 401 &&
        /missing|placeholder|API_KEY/i.test(error.message)
      ) {
        console.error(`[${serviceLabel}] misconfigured: ${error.message}`);
        return Response.json(
          { error: `${serviceLabel} is not configured` },
          { status: 500 },
        );
      }
      const headers: Record<string, string> = {};
      if (error.status === 429) {
        headers["Retry-After"] = "60";
        return Response.json(
          { error: `${serviceLabel} is temporarily rate limited` },
          { status: 429, headers },
        );
      }
      if (error.status === 404) {
        return Response.json(
          { error: error.message || `${serviceLabel} not found` },
          { status: 404 },
        );
      }
      return Response.json(
        { error: `${serviceLabel} is temporarily unavailable` },
        { status: error.status >= 500 ? 502 : 503 },
      );
    }
    case "TimeoutError":
      return Response.json(
        { error: `${serviceLabel} timed out` },
        { status: 504 },
      );
    case "SchemaParseError":
      return Response.json(
        { error: `${serviceLabel} returned an unexpected response` },
        { status: 502 },
      );
  }
};

export async function handle<A>(
  request: Request,
  scope: string,
  options: RouteOptions,
  produce: () => Effect.Effect<A, AppError, AppContext>,
): Promise<Response> {
  const ip = extractClientIp(request);

  let decision: RateLimitDecision;
  try {
    decision = await runtime.runPromise(
      Effect.gen(function* () {
        const limiter = yield* RateLimit;
        return yield* limiter.check(ip, {
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
          // Conventional Unix timestamp in seconds (not milliseconds).
          "X-RateLimit-Reset": String(
            Math.ceil((Date.now() + decision.resetMs) / 1000),
          ),
        },
      },
    );
  }

  let program: Effect.Effect<A, AppError, AppContext>;
  try {
    program = produce();
  } catch (error) {
    if (error instanceof BadRequestError) {
      return errorToResponse(error, options.serviceLabel);
    }
    console.error(`[${scope}] request setup failed`, error);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  try {
    const exit = await runtime.runPromiseExit(program);
    if (exit._tag === "Success") {
      return Response.json(exit.value);
    }
    if (exit.cause._tag === "Fail") {
      return errorToResponse(exit.cause.error, options.serviceLabel);
    }
    console.error(`[${scope}] unhandled cause`, exit.cause);
  } catch (error) {
    console.error(`[${scope}] unhandled error`, error);
  }

  return Response.json(
    { error: "Internal server error" },
    { status: 500 },
  );
}
