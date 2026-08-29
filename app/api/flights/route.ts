import { getFlights } from "@/lib/api-clients";
import { FLIGHTS_ENABLED } from "@/lib/features";
import { handle } from "@/lib/route-utils";
import { Effect } from "effect";

export async function GET(request: Request) {
  return handle(
    request,
    "flights",
    { maxRequests: 60, serviceLabel: "Flight data" },
    () => (FLIGHTS_ENABLED ? getFlights() : Effect.succeed([])),
  );
}
