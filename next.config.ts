import type { NextConfig } from "next";

const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https://images.data.gov.sg https://datamall2.mytransport.sg https://*.basemaps.cartocdn.com data: blob:",
  "connect-src 'self' https://datamall2.mytransport.sg https://api.data.gov.sg https://api.aviationstack.com https://opensky-network.org https://www.straitstimes.com https://www.channelnewsasia.com https://*.basemaps.cartocdn.com",
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader,
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
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
    ],
  },
};

export default nextConfig;
