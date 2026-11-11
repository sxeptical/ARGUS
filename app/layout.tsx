import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import { Geist, JetBrains_Mono } from "next/font/google";
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

  return (
    <html
      lang="en"
      className={`${geist.variable} ${jetBrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        {children}
      </body>
    </html>
  );
}
