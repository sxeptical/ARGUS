import { getFlights } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

const FLIGHTS_API_DISABLED = true;

export async function GET(request: Request) {
  // Flight data is temporarily disabled while the upstream provider is
  // unavailable. Return an empty feed so the dashboard remains healthy.
  if (FLIGHTS_API_DISABLED) {
    return Response.json([]);
  }

  return handle(
    request,
    "flights",
    { maxRequests: 60, serviceLabel: "Flight data" },
    getFlights(),
  );
}
