import { getBusRoute } from "@/lib/api-clients";
import {
  BUS_SERVICE_NO_RE,
  BUS_STOP_ID_RE,
  handle,
} from "@/lib/route-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const serviceNo = searchParams.get("serviceNo")?.trim() ?? "";
  const stopIdRaw = searchParams.get("stopId");
  const stopId = stopIdRaw?.trim() || undefined;

  if (!serviceNo) {
    return Response.json(
      { error: "Query param serviceNo is required" },
      { status: 400 },
    );
  }

  if (!BUS_SERVICE_NO_RE.test(serviceNo)) {
    return Response.json(
      {
        error:
          "Query param serviceNo must be 1–8 alphanumeric characters (e.g. 12, 12e, NR1)",
      },
      { status: 400 },
    );
  }

  if (stopId !== undefined && !BUS_STOP_ID_RE.test(stopId)) {
    return Response.json(
      { error: "Query param stopId must be a 5-digit bus stop code" },
      { status: 400 },
    );
  }

  return handle(
    request,
    "bus-routes",
    { maxRequests: 60, serviceLabel: "Bus route data" },
    getBusRoute(serviceNo, stopId),
  );
}
