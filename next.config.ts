import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js needs inline scripts, plus eval for HMR in development.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      // Tailwind emits inline styles at runtime; runtime style injection.
      "style-src 'self' 'unsafe-inline'",
      // Camera images (data.gov.sg, LTA S3) and OpenFreeMap raster assets.
      "img-src 'self' data: blob: https://images.data.gov.sg https://datamall2.mytransport.sg https://dm-traffic-camera-itsc.s3.ap-southeast-1.amazonaws.com https://tiles.openfreemap.org",
      // OpenFreeMap style, vector/raster tiles, sprites, and glyphs.
      "connect-src 'self' https://tiles.openfreemap.org",
      // Google Fonts (loaded via stylesheet) and self-hosted font data URIs.
      "font-src 'self' data: https://fonts.gstatic.com",
      // MapLibre's worker is copied to public/maplibre/ at build time.
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
  // Next.js 16 blocks dev-only resources for cross-origin hosts by default.
  // Allow the loopback hosts used for local tooling and the managed preview
  // tunnel (any subdomain) so the dashboard hydrates there in development.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.preview.usehoplite.com",
  ],
  experimental: {
    // Use Next's compiler API: its CLI checker can mis-resolve the native
    // TypeScript package alias used by `bun run typecheck`.
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
