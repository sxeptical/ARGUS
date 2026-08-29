import { getBusRoute } from "@/lib/api-clients";
import {
  BUS_SERVICE_NO_RE,
  BUS_STOP_ID_RE,
  handle,
  optionalQueryParam,
  requiredQueryParam,
} from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "bus-routes",
    { maxRequests: 60, serviceLabel: "Bus route data" },
    () => {
      const serviceNo = requiredQueryParam(
        request,
        "serviceNo",
        BUS_SERVICE_NO_RE,
        "must be 1–8 alphanumeric characters (e.g. 12, 12e, NR1)",
      );
      const stopId = optionalQueryParam(
        request,
        "stopId",
        BUS_STOP_ID_RE,
        "must be a 5-digit bus stop code",
      );
      return getBusRoute(serviceNo, stopId);
    },
  );
}
