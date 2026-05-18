import { getNews } from "@/lib/api-clients";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const ip = extractClientIp(request);
  const { allowed } = checkRateLimit(ip, 30);
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const data = await getNews();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch news", error);
    return Response.json({ error: "Failed to fetch news" }, { status: 500 });
  }
}
