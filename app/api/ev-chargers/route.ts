import { getEvChargingLocations } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(request, "ev-chargers", { maxRequests: 60, serviceLabel: "EV charging point data" }, () => getEvChargingLocations());
}
