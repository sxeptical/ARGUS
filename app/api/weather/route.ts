import { getWeather } from "@/lib/api-clients";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const ip = extractClientIp(request);
  const { allowed } = checkRateLimit(ip, 60);
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const data = await getWeather();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch weather", error);
    return Response.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}
