import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

// Content-Security-Policy is set per request in proxy.ts (nonce-based, so Next
// can nonce its inline bootstrap scripts). The other headers below are static
// and safe to apply to every response. Non-document responses (API routes,
// _next/static, and public assets such as the *.json data bundles and the
// MapLibre worker) are excluded from the proxy matcher: CSP only governs
// documents, so those responses do not need a policy.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Next.js 16 blocks dev-only resources for cross-origin hosts by default.
  // Allow the loopback hosts used for local tooling and the managed preview
  // tunnel (any subdomain) so the dashboard hydrates there in development.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.preview.usehoplite.com",
  ],
  images: {
    // Disabled because camera images are dynamic external URLs from LTA;
    // unoptimized avoids Next.js image processing overhead and cost on Vercel.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.data.gov.sg",
      },
      {
        protocol: "https",
        hostname: "datamall2.mytransport.sg",
      },
      {
        // LTA traffic camera images are served from this S3 bucket.
        protocol: "https",
        hostname: "dm-traffic-camera-itsc.s3.ap-southeast-1.amazonaws.com",
      },
      // Mall / hawker centre photos (Wikimedia Commons, NEA).
      { protocol: "https", hostname: "thumb.wikimedia.org" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "www.nea.gov.sg" },
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;

// Expose wrangler.jsonc bindings (rate limiters) to `next dev`.
initOpenNextCloudflareForDev();
