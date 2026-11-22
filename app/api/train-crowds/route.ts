import { getTrainCrowds } from "@/lib/api-clients";
import { handle } from "@/lib/route-utils";

export async function GET(request: Request) {
  return handle(
    request,
    "train-crowds",
    { maxRequests: 120, serviceLabel: "Train crowd data" },
    (signal) => getTrainCrowds(signal),
  );
}
