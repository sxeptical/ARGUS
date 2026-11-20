import { getWeatherAlerts } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "weather-alerts",
    { maxRequests: 120, serviceLabel: "Lightning and rain data" },
    (signal) => getWeatherAlerts(signal),
  );
}
