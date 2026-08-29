import { getWeather } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "weather",
    { maxRequests: 120, serviceLabel: "Weather data" },
    () => getWeather(),
  );
}
