import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No ISR or data cache is used; API responses are cached in-memory by lib/cache.ts.
export default defineCloudflareConfig();
