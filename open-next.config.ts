import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * Every page awaits `connection()` and all API routes are dynamic, so there is
 * no ISR/SSG output and no `revalidateTag`/`revalidatePath` usage. The default
 * "dummy" incremental cache, tag cache, and queue are therefore sufficient and
 * avoid provisioning R2/D1/DO resources that would never be read.
 */
export default defineCloudflareConfig({});
