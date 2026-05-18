import { getBusStops } from "@/lib/api-clients";

export async function GET() {
  try {
    const data = await getBusStops();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch bus stops", error);
    return Response.json({ error: "Failed to fetch bus stops" }, { status: 500 });
  }
}
