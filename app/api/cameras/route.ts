import { ExternalApiError, getTrafficCameras } from "@/lib/api-clients";
import { checkRateLimit, extractClientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const ip = extractClientIp(request);
  const { allowed } = checkRateLimit(ip, 60);
  if (!allowed) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const data = await getTrafficCameras();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch traffic cameras", error);
    if (error instanceof ExternalApiError) {
      return Response.json(
        { error: "LTA API key is missing, invalid, or unauthorized" },
        { status: error.status },
      );
    }
    return Response.json({ error: "Failed to fetch traffic cameras" }, { status: 500 });
  }
}
