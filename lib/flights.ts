import type { FlightState } from "@/types";

export function summarizeFlights(flights: readonly FlightState[]) {
  return flights.reduce(
    (summary, flight) => {
      summary[flight.direction] += 1;
      return summary;
    },
    { inbound: 0, outbound: 0, transit: 0 },
  );
}
