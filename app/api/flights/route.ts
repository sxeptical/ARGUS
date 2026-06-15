import { getFlights } from "@/lib/api-clients";
import { getRateLimitResponse } from "@/lib/route-utils";

export async function GET(request: Request) {
  const rateLimited = getRateLimitResponse(request, {
    scope: "flights",
    maxRequests: 60,
  });
  if (rateLimited) return rateLimited;

  try {
    const data = await getFlights();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch flights", error);
    return Response.json({ error: "Failed to fetch flights" }, { status: 500 });
  }
}
