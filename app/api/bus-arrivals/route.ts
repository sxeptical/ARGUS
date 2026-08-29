import { getBusArrivals } from "@/lib/api-clients";
import {
  BUS_STOP_ID_RE,
  handle,
  requiredQueryParam,
} from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "bus-arrivals",
    { maxRequests: 90, serviceLabel: "Bus arrival data" },
    () => {
      const stopId = requiredQueryParam(
        request,
        "stopId",
        BUS_STOP_ID_RE,
        "must be a 5-digit bus stop code",
      );
      return getBusArrivals(stopId);
    },
  );
}
