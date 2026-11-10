"use client";

import { useEffect } from "react";

/**
 * Cloudflare Web Analytics beacon, injected per hostname.
 *
 * The zone's automatic setup can't inject into Worker responses, so this is a
 * manual install. Manual sites are host-bound, hence one token per host.
 * Tokens are public site identifiers, not secrets.
 */
const SITE_TOKENS: Record<string, string> = {
  "argusint.live": "8566a07e5b00401492a38356c9f54cc7",
  "www.argusint.live": "25a25ac3651745ad9800eab3ece0024a",
};

export default function CloudflareAnalytics() {
  useEffect(() => {
    const token = SITE_TOKENS[window.location.hostname];
    if (!token) return;
    if (document.querySelector("script[data-cf-beacon]")) return;

    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://static.cloudflareinsights.com/beacon.min.js";
    script.dataset.cfBeacon = JSON.stringify({ token });
    document.body.appendChild(script);
  }, []);

  return null;
}
