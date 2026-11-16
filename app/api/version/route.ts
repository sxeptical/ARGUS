export const dynamic = "force-dynamic";

/**
 * A value that changes with each deployment. Vercel exposes the commit SHA;
 * on Cloudflare Workers, OpenNext bakes `OPEN_NEXT_BUILD_ID` into the server
 * bundle at build time. Without this, every deploy reports "development" and
 * the update toast can never detect a new version.
 */
export const getDeploymentVersion = (): string => {
  const candidates = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.VERCEL_DEPLOYMENT_ID,
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    process.env.OPEN_NEXT_BUILD_ID,
  ];

  return candidates.find((value) => value?.trim())?.trim() ?? "development";
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
