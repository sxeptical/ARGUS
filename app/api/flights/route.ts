// import { getFlights } from "@/lib/api-clients";
// import { handle } from "@/lib/route-utils";

// export async function GET(request: Request) {
//   return handle(
//     request,
//     "flights",
//     { maxRequests: 60, serviceLabel: "Flight data" },
//     getFlights(),
//   );
// }

export async function GET() {
  // Flight data is temporarily disabled while the upstream provider is
  // unavailable. Return an empty feed so the dashboard remains healthy.
  return Response.json([]);
}
