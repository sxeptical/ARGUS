/**
 * Content Security Policy helpers shared by `proxy.ts`.
 *
 * Kept free of Node.js-only APIs so it runs unchanged in the Cloudflare
 * Workers runtime (Web Crypto + btoa are available in both Workers and Node).
 */

export type CspOptions = {
  /** Adds `'unsafe-eval'`, which React/Next need for dev error stacks. */
  dev?: boolean;
};

/** Generates a URL-safe-ish base64 nonce (Next's parser accepts `+`, `/`, `=`). */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

/**
 * Builds the document CSP. Nonce-based script-src replaces `'unsafe-inline'`;
 * `'strict-dynamic'` lets the nonce-authorized Next.js bootstrap load its own
 * chunks. Every non-script directive mirrors the previous `next.config.ts`
 * policy (MapLibre tiles/worker, camera + Wikimedia + NEA images, fonts).
 */
export function buildContentSecurityPolicy(
  nonce: string,
  { dev = false }: CspOptions = {},
): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Tailwind injects inline styles at runtime and MapLibre ships inline styles.
    "style-src 'self' 'unsafe-inline'",
    // Camera images (data.gov.sg, LTA S3), OpenFreeMap raster assets,
    // Wikimedia Commons place photos (thumb./upload.wikimedia.org), and
    // NEA's hawker centre photos.
    "img-src 'self' data: blob: https://images.data.gov.sg https://datamall2.mytransport.sg https://dm-traffic-camera-itsc.s3.ap-southeast-1.amazonaws.com https://tiles.openfreemap.org https://thumb.wikimedia.org https://upload.wikimedia.org https://www.nea.gov.sg",
    // OpenFreeMap style, vector/raster tiles, sprites, and glyphs.
    "connect-src 'self' https://tiles.openfreemap.org",
    // Google Fonts (loaded via stylesheet) and self-hosted font data URIs.
    "font-src 'self' data: https://fonts.gstatic.com",
    // MapLibre's worker is copied to public/maplibre/ at build time and loaded
    // from /maplibre/maplibre-gl-worker.mjs (same-origin). worker-src (plus
    // child-src for older browsers) governs that script, not script-src.
    "worker-src 'self'",
    "child-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}
