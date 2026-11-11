/**
 * Route handler helper. Rate limiting precedes validation so malformed requests
 * also consume budget; allowed requests invoke the producer lazily.
 */
import { extractClientIp } from "@/lib/rate-limit";
import { sharedRateLimiter } from "@/lib/shared-rate-limit";
import {
  BadRequestError,
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
} from "@/lib/errors";

// 5-digit LTA bus stop code, as accepted by the LTA BusArrival endpoint.
export const BUS_STOP_ID_RE = /^\d{5}$/;

// LTA bus service numbers: digits with optional trailing letter(s), e.g. 12, 12e, NR1.
export const BUS_SERVICE_NO_RE = /^[A-Za-z0-9]{1,8}$/;

type RouteOptions = {
  readonly maxRequests?: number;
  readonly serviceLabel: string;
};

/** Overall per-request budget; `produce` receives an AbortSignal at this deadline. */
export const ROUTE_DEADLINE_MS = 20_000;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

const jsonResponse = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response =>
  Response.json(body, {
    status,
    headers: { ...NO_STORE_HEADERS, ...headers },
  });

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

const errorToResponse = (
  error: unknown,
  scope: string,
  serviceLabel: string,
): Response => {
  if (error instanceof BadRequestError) {
    return jsonResponse({ error: error.message }, 400);
  }
  if (error instanceof TimeoutError) {
    return jsonResponse({ error: `${serviceLabel} timed out` }, 504);
  }
  if (error instanceof SchemaParseError) {
    return jsonResponse(
      { error: `${serviceLabel} returned an unexpected response` },
      502,
    );
  }
  if (error instanceof ExternalApiError) {
    // Missing server-side API keys are a deployment misconfiguration, not a
    // transient upstream outage. Surface as 500 so ops can distinguish
    // "not configured" from "temporarily unavailable".
    if (
      error.status === 401 &&
      /missing|placeholder|API_KEY/i.test(error.message)
    ) {
      console.error(`[${serviceLabel}] misconfigured: ${error.message}`);
      return jsonResponse({ error: `${serviceLabel} is not configured` }, 500);
    }
    if (error.status === 429) {
      return jsonResponse(
        { error: `${serviceLabel} is temporarily rate limited` },
        429,
        { "Retry-After": "60" },
      );
    }
    if (error.status === 404) {
      return jsonResponse(
        { error: error.message || `${serviceLabel} not found` },
        404,
      );
    }
    return jsonResponse(
      { error: `${serviceLabel} is temporarily unavailable` },
      error.status >= 500 ? 502 : 503,
    );
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    // The client disconnected; no one receives this response. Avoid logging
    // it as an unhandled server error.
    return jsonResponse({ error: "Request aborted" }, 499);
  }
  console.error(`[${scope}] unhandled error`, error);
  return jsonResponse({ error: "Internal server error" }, 500);
};

export async function handle<A>(
  request: Request,
  scope: string,
  options: RouteOptions,
  produce: (signal: AbortSignal) => A | Promise<A>,
): Promise<Response> {
  // Start the deadline before the first await so it covers the (possibly
  // remote) rate-limit lookup as well as the producer.
  const deadlineError = new TimeoutError({
    service: options.serviceLabel,
    message: `${options.serviceLabel} timed out`,
  });
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(deadlineError),
    ROUTE_DEADLINE_MS,
  );
  const signal = AbortSignal.any([request.signal, deadline.signal]);

  const decision = await sharedRateLimiter.check(extractClientIp(request), {
    scope,
    maxRequests: options.maxRequests,
  });

  if (!decision.allowed) {
    clearTimeout(timer);
    const retryAfterSeconds = Math.max(1, Math.ceil(decision.resetMs / 1000));
    return jsonResponse(
      { error: "Too many requests" },
      429,
      {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": String(decision.remaining),
        // Conventional Unix timestamp in seconds (not milliseconds).
        "X-RateLimit-Reset": String(
          Math.ceil((Date.now() + decision.resetMs) / 1000),
        ),
      },
    );
  }

  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const abort = () => {
      if (deadline.signal.aborted) {
        reject(deadlineError);
      } else {
        reject(
          request.signal.reason ??
            new DOMException("Request aborted", "AbortError"),
        );
      }
    };
    onAbort = abort;
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });

  try {
    return jsonResponse(await Promise.race([produce(signal), abortPromise]));
  } catch (error) {
    return errorToResponse(error, scope, options.serviceLabel);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
