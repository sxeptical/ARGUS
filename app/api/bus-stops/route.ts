import { getBusStops } from "@/lib/api-clients";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const ip = extractClientIp(request);
  const { allowed } = checkRateLimit(ip);
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const data = await getBusStops();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch bus stops", error);
    return Response.json({ error: "Failed to fetch bus stops" }, { status: 500 });
  }
}
