import { getTrafficCameras } from "@/lib/api-clients";
import {
  getExternalApiErrorResponse,
  getRateLimitResponse,
} from "@/lib/route-utils";

export async function GET(request: Request) {
  const rateLimited = getRateLimitResponse(request, {
    scope: "cameras",
    maxRequests: 120,
  });
  if (rateLimited) return rateLimited;

  try {
    const data = await getTrafficCameras();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch traffic cameras", error);
    return (
      getExternalApiErrorResponse(error, "Traffic camera data") ??
      Response.json(
        { error: "Failed to fetch traffic cameras" },
        { status: 500 },
      )
    );
  }
}
