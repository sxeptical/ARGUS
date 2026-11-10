import { getCloudflareContext } from "@opennextjs/cloudflare";

export const dynamic = "force-dynamic";

// CF_VERSION_METADATA changes on every Workers deploy; see wrangler.jsonc.
const getDeploymentVersion = (): string => {
  try {
    const id = getCloudflareContext().env.CF_VERSION_METADATA?.id;
    if (id?.trim()) return id.trim();
  } catch {
    // Not running on Workers (e.g. plain `next start`).
  }
  return "development";
};

export async function GET() {
  return Response.json(
    {
      version: getDeploymentVersion(),
      checkedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0, must-revalidate",
      },
    },
  );
}
