import { getTrainServiceAlerts } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "train-alerts",
    { maxRequests: 120, serviceLabel: "Train service alert data" },
    () => getTrainServiceAlerts(),
  );
}
