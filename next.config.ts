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
    // MapLibre uses blob: workers and Carto tile fetches. Next.js dev
    // needs 'unsafe-eval' + 'unsafe-inline' for HMR; production builds
    // only need 'unsafe-inline' for runtime style injection. We loosen
    // only where necessary and document why.
    value: [
      "default-src 'self'",
      // Next.js inlines small scripts; dev mode needs eval for HMR.
      // Production drops unsafe-eval — only inline scripts remain.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
      // Tailwind emits inline styles at runtime; runtime style injection.
      "style-src 'self' 'unsafe-inline'",
      // Camera images (data.gov.sg, LTA S3), Carto basemap tiles.
      "img-src 'self' data: blob: https://images.data.gov.sg https://datamall2.mytransport.sg https://dm-traffic-camera-itsc.s3.ap-southeast-1.amazonaws.com https://*.basemaps.cartocdn.com https://a.basemaps.cartocdn.com https://b.basemaps.cartocdn.com",
      // Carto tile JSON and vector tile fetches.
      "connect-src 'self' https://*.basemaps.cartocdn.com",
      // Google Fonts (loaded via stylesheet) and self-hosted font data URIs.
      "font-src 'self' data: https://fonts.gstatic.com",
      // MapLibre creates blob: web workers for vector tile parsing.
      "worker-src 'self' blob:",
      "child-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
