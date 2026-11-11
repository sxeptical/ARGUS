import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/csp";

/**
 * Per-request nonce CSP (Next.js 16 `proxy` file convention, formerly
 * `middleware`). Next parses the `'nonce-…'` value out of the request
 * `Content-Security-Policy` header and applies it to its own inline/bootstrap
 * scripts during SSR, so nonce-based CSP requires dynamic rendering (see the
 * `connection()` call in `app/layout.tsx`).
 *
 * Matcher excludes API routes, Next internals, and static files: CSP governs
 * documents, so JSON bundles, the MapLibre worker/chunks, and image responses
 * do not need (and should not get) a per-request policy.
 */
export function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const contentSecurityPolicy = buildContentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match documents only. Skip:
     * - api (JSON/route handlers)
     * - _next/static, _next/image (build output and optimized images)
     * - favicon and public static files (*.json data bundles, MapLibre
     *   *.mjs worker/chunk, images, fonts)
     */
    {
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:json|mjs|js|css|png|jpe?g|gif|svg|webp|ico|woff2?|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
