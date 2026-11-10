// Bindings declared in wrangler.jsonc, merged into OpenNext's CloudflareEnv.
// Hand-written because `wrangler types` output conflicts with the DOM lib.
declare global {
  interface CloudflareEnv {
    CF_VERSION_METADATA?: { id: string; tag: string; timestamp: string };
    ARGUS_ON_CLOUDFLARE?: string;
    LTA_API_KEY?: string;
    AVIATIONSTACK_API_KEY?: string;
  }
}

export {};
