import { getTrafficIncidents } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(request, "incidents", { maxRequests: 120, serviceLabel: "Road incident data" }, () => getTrafficIncidents());
}
