import { getWeather } from "@/lib/api-clients";
import { getRateLimitResponse } from "@/lib/route-utils";

export async function GET(request: Request) {
  const rateLimited = getRateLimitResponse(request, {
    scope: "weather",
    maxRequests: 120,
  });
  if (rateLimited) return rateLimited;

  try {
    const data = await getWeather();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch weather", error);
    return Response.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}
