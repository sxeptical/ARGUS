import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { headers } from "next/headers";
import { Geist, JetBrains_Mono } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

const geist = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ARGUS — Singapore Signal Monitor",
  description: "Live Singapore transport, weather, camera, and news signals.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A fresh CSP nonce is issued per request by proxy.ts, so every route using
  // this layout must render dynamically (no build-time static shell). The
  // nonce is applied to Next's scripts automatically from the request CSP
  // header; this call only opts the segment into request-time rendering.
  await connection();

  // The same nonce authorizes the pre-paint theme script below; proxy.ts
  // forwards it as a request header for exactly this purpose.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html
      lang="en"
      // data-theme is written by the pre-paint script (and the toggle)
      // before React hydrates; React never renders it, so this only silences
      // that expected attribute difference on this element.
      suppressHydrationWarning
      className={`${geist.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        {/*
         * Applies the stored theme before first paint so a returning light
         * user never sees a dark flash. Inline and parser-blocking: it runs
         * before the rest of the body draws. React never rewrites the
         * data-theme attribute (only the toggle in use-theme does), so this
         * script and hydration stay out of each other's way.
         */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
        {children}
      </body>
    </html>
  );
}
