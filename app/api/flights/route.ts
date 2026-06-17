import { getFlights } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "flights",
    { maxRequests: 60, serviceLabel: "Flight data" },
    getFlights(),
  );
}
