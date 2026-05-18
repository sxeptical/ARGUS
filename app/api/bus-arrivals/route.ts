import { getBusArrivals } from "@/lib/api-clients";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const ip = extractClientIp(request);
  const { allowed } = checkRateLimit(ip, 60);
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const stopId = searchParams.get("stopId");

    if (!stopId) {
      return Response.json({ error: "Query param stopId is required" }, { status: 400 });
    }

    const data = await getBusArrivals(stopId);
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch bus arrivals", error);
    return Response.json({ error: "Failed to fetch bus arrivals" }, { status: 500 });
  }
}
