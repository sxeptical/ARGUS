import { getTrafficCameras } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "cameras",
    { maxRequests: 120, serviceLabel: "Traffic camera data" },
    () => getTrafficCameras(),
  );
}
