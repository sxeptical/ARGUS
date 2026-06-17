import { getBusStops } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "bus-stops",
    { maxRequests: 60, serviceLabel: "Bus stop data" },
    getBusStops(),
  );
}
