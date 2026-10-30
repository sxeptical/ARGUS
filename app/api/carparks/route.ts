import { getCarparkAvailability } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(request, "carparks", { maxRequests: 120, serviceLabel: "Carpark availability data" }, () => getCarparkAvailability());
}
