import { getWeather } from "@/lib/api-clients";

export async function GET() {
  try {
    const data = await getWeather();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch weather", error);
    return Response.json({ error: "Failed to fetch weather" }, { status: 500 });
  }
}
