/**
 * Country of the visitor behind a request, as an upper-case ISO 3166-1
 * alpha-2 code, or `null` when the platform does not tell us.
 *
 * Only platform-provided values are used: Vercel's header on Vercel, and
 * Cloudflare's `cf-ipcountry` header when proxy headers are trusted. Otherwise
 * a client could set the headers itself, so they are ignored (same rule as
 * `extractClientIp`).
 */

const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

/** Cloudflare reports unknown locations as "XX" and Tor exits as "T1". */
const normalizeCountry = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return COUNTRY_CODE_RE.test(code) && code !== "XX" ? code : null;
};

export function visitorCountry(request: Request): string | null {
  // Local development has no geolocation; ARGUS_DEV_COUNTRY stands in for it.
  if (process.env.NODE_ENV !== "production") {
    const override = normalizeCountry(process.env.ARGUS_DEV_COUNTRY);
    if (override) return override;
  }

  if (process.env.VERCEL === "1") {
    const fromVercel = normalizeCountry(request.headers.get("x-vercel-ip-country"));
    if (fromVercel) return fromVercel;
  }

  if (process.env.ARGUS_TRUST_PROXY_HEADERS === "true") {
    return normalizeCountry(request.headers.get("cf-ipcountry"));
  }

  return null;
}
