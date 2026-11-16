/**
 * Country of the visitor behind a request, as an upper-case ISO 3166-1
 * alpha-2 code, or `null` when the platform does not tell us.
 *
 * Only platform-provided values are used: the Workers `cf` object, Cloudflare's
 * `cf-ipcountry` header when proxy headers are trusted, and Vercel's header on
 * Vercel. Off those platforms a client could set the headers itself, so they
 * are ignored (same rule as `extractClientIp`).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

/** Cloudflare reports unknown locations as "XX" and Tor exits as "T1". */
const normalizeCountry = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE_RE.test(code) && code !== "XX" ? code : null;
};

function cloudflareCountry(): string | null {
  try {
    return normalizeCountry(getCloudflareContext().cf?.country);
  } catch {
    // No Workers request context (tests, plain `next dev`, Vercel).
    return null;
  }
}

export function visitorCountry(request: Request): string | null {
  // Local development has no geolocation; ARGUS_DEV_COUNTRY stands in for it.
  if (process.env.NODE_ENV !== "production") {
    const override = normalizeCountry(process.env.ARGUS_DEV_COUNTRY);
    if (override) return override;
  }

  const fromWorker = cloudflareCountry();
  if (fromWorker) return fromWorker;

  if (process.env.ARGUS_TRUST_PROXY_HEADERS === "true") {
    const fromCloudflare = normalizeCountry(request.headers.get("cf-ipcountry"));
    if (fromCloudflare) return fromCloudflare;
  }

  if (process.env.VERCEL === "1") {
    return normalizeCountry(request.headers.get("x-vercel-ip-country"));
  }

  return null;
}
