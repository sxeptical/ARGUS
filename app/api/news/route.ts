import { getNews } from "@/lib/api-clients";

export async function GET() {
  try {
    const data = await getNews();
    return Response.json(data);
  } catch (error) {
    console.error("Failed to fetch news", error);
    return Response.json({ error: "Failed to fetch news" }, { status: 500 });
  }
}
