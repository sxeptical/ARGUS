import { getBusArrivals } from "@/lib/api-clients";

export async function GET(request: Request) {
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
