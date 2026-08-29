import { getNews } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "news",
    { maxRequests: 120, serviceLabel: "News data" },
    () => getNews(),
  );
}
