import { ExternalApiError } from "@/lib/api-clients";
import { checkGlobalRateLimit, extractClientIp } from "@/lib/rate-limit";

export const BUS_STOP_ID_RE = /^\d{5}$/;

type RateLimitOptions = {
  maxRequests?: number;
  windowMs?: number;
  scope?: string;
};

export function getRateLimitResponse(
  request: Request,
  options: RateLimitOptions = {},
): Response | null {
  const ip = extractClientIp(request);
  const { allowed, remaining, resetMs } = checkGlobalRateLimit(
    ip,
    options.maxRequests,
    options.windowMs,
    options.scope,
  );

  if (allowed) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil(resetMs / 1000));
  return Response.json(
    { error: "Too many requests" },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Date.now() + resetMs),
      },
    },
  );
}

export function getExternalApiErrorResponse(
  error: unknown,
  serviceLabel: string,
): Response | null {
  if (!(error instanceof ExternalApiError)) return null;

  const headers: Record<string, string> = {};
  if (error.status === 429) {
    headers["Retry-After"] = "60";
  }

  const status = error.status === 429 ? 503 : error.status >= 500 ? 502 : 503;
  return Response.json(
    { error: `${serviceLabel} is temporarily unavailable` },
    { status, headers },
  );
}
