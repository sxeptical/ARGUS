import { getBusStops } from "@/lib/api-clients";
import {
  getExternalApiErrorResponse,
  getRateLimitResponse,
} from "@/lib/route-utils";

export async function GET(request: Request) {
  const rateLimited = getRateLimitResponse(request, {
    scope: "bus-stops",
    maxRequests: 60,
  });
  if (rateLimited) return rateLimited;

  try {
    const data = await getBusStops();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch bus stops", error);
    return (
      getExternalApiErrorResponse(error, "Bus stop data") ??
      Response.json({ error: "Failed to fetch bus stops" }, { status: 500 })
    );
  }
}
