export const dynamic = "force-dynamic";

const getDeploymentVersion = (): string => {
  const candidates = [
    process.env.VERCEL_GIT_COMMIT_SHA,
    process.env.VERCEL_DEPLOYMENT_ID,
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
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
