import { getBusArrivals } from "@/lib/api-clients";
import {
  BUS_STOP_ID_RE,
  getExternalApiErrorResponse,
  getRateLimitResponse,
} from "@/lib/route-utils";

export async function GET(request: Request) {
  const rateLimited = getRateLimitResponse(request, {
    scope: "bus-arrivals",
    maxRequests: 90,
  });
  if (rateLimited) return rateLimited;

  try {
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get("stopId");

    if (!stopId) {
      return Response.json(
        { error: "Query param stopId is required" },
        { status: 400 },
      );
    }

    if (!BUS_STOP_ID_RE.test(stopId)) {
      return Response.json(
        { error: "Query param stopId must be a 5-digit bus stop code" },
        { status: 400 },
      );
    }

    const data = await getBusArrivals(stopId);
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch bus arrivals", error);
    return (
      getExternalApiErrorResponse(error, "Bus arrival data") ??
      Response.json({ error: "Failed to fetch bus arrivals" }, { status: 500 })
    );
  }
}
