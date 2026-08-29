import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "geolocation=(), microphone=(), camera=()",
  },
  {
    key: "Content-Security-Policy",
    // MapLibre loads its worker same-origin (public/maplibre/) and
    // OpenFreeMap serves the keyless basemap. Next.js dev needs
    // 'unsafe-eval' +
    // 'unsafe-inline' for HMR; production builds only need 'unsafe-inline'
    // for runtime style injection. We loosen only where necessary.
    value: [
      "default-src 'self'",
      // Next.js inlines small scripts; dev mode needs eval for HMR.
      // Production drops unsafe-eval — only inline scripts remain.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      // Tailwind emits inline styles at runtime; runtime style injection.
      "style-src 'self' 'unsafe-inline'",
      // Camera images (data.gov.sg, LTA S3) and OpenFreeMap raster assets.
      "img-src 'self' data: blob: https://images.data.gov.sg https://datamall2.mytransport.sg https://dm-traffic-camera-itsc.s3.ap-southeast-1.amazonaws.com https://tiles.openfreemap.org",
      // OpenFreeMap style, vector/raster tiles, sprites, and glyphs.
      "connect-src 'self' https://tiles.openfreemap.org",
      // Google Fonts (loaded via stylesheet) and self-hosted font data URIs.
      "font-src 'self' data: https://fonts.gstatic.com",
      // MapLibre v6 loads its ESM worker from a same-origin URL
      // (public/maplibre/, copied by scripts/copy-maplibre-worker.mjs), so no
      // blob: worker allowance is needed anymore.
      "worker-src 'self'",
      "child-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // TypeScript setup: the project installs real typescript@6 as the
    // canonical compiler API (required by typescript-eslint and Next's
    // API-based build checker) plus @typescript/native (TS 7) whose binary
    // backs `bun run typecheck`. Next's default CLI checker requires a
    // physical typescript/bin/tsc from the typescript package itself and
    // mis-resolves aliased installs on some environments, so builds
    // type-check via the JS API here instead. `stableTypeOrdering` is
    // enabled in tsconfig so TS 6 and TS 7 use compatible ordering; see
    // https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
    useTypeScriptCli: false,
  },
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
