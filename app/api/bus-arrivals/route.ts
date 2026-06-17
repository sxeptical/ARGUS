import { getBusArrivals } from "@/lib/api-clients";
import { BUS_STOP_ID_RE, handle } from "@/lib/route-utils";

export async function GET(request: Request) {
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

  return handle(
    request,
    "bus-arrivals",
    { maxRequests: 90, serviceLabel: "Bus arrival data" },
    getBusArrivals(stopId),
  );
}
