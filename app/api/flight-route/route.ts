import { getFlightRoute } from "@/lib/api-clients";
import { FLIGHTS_ENABLED } from "@/lib/features";
import { handle, requiredQueryParam } from "@/lib/route-utils";

const CALLSIGN_RE = /^[A-Za-z0-9-]{2,12}$/;

export async function GET(request: Request) {
  return handle(
    request,
    "flight-route",
    { maxRequests: 120, serviceLabel: "Flight route" },
    (signal) => {
      const callsign = requiredQueryParam(
        request,
        "callsign",
        CALLSIGN_RE,
        "must be a 2-12 character flight callsign",
      );
      return FLIGHTS_ENABLED ? getFlightRoute(callsign, signal) : null;
    },
  );
}
