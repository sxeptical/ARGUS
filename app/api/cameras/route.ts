import { getTrafficCameras } from "@/lib/api-clients";

export async function GET() {
  try {
    const data = await getTrafficCameras();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch traffic cameras", error);
    return Response.json({ error: "Failed to fetch traffic cameras" }, { status: 500 });
  }
}
