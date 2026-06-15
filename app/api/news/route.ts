import { getNews } from "@/lib/api-clients";
import { getRateLimitResponse } from "@/lib/route-utils";

export async function GET(request: Request) {
  const rateLimited = getRateLimitResponse(request, {
    scope: "news",
    maxRequests: 120,
  });
  if (rateLimited) return rateLimited;

  try {
    const data = await getNews();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch news", error);
    return Response.json({ error: "Failed to fetch news" }, { status: 500 });
  }
}
