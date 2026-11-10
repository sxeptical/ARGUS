import busRoutesData from "@/public/bus-routes.json";

/** `[busStopCode, stopSequence]` pairs, ordered by sequence. */
export type BusRouteStopEntry = [busStopCode: string, stopSequence: number];

/** Service number → direction → ordered stops. Built by scripts/fetch-bus-routes.ts. */
export type BusRoutesSnapshot = {
  fetchedAt: string;
  services: Record<string, Record<string, BusRouteStopEntry[]>>;
};

const isStopEntry = (value: unknown): value is BusRouteStopEntry =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  value[0].length > 0 &&
  Number.isInteger(value[1]);

export function validateBusRoutesSnapshot(
  value: unknown,
): value is BusRoutesSnapshot {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<BusRoutesSnapshot>;
  if (typeof data.fetchedAt !== "string" || !data.services) return false;
  return Object.values(data.services).every(
    (byDirection) =>
      !!byDirection &&
      typeof byDirection === "object" &&
      Object.values(byDirection).every(
        (stops) => Array.isArray(stops) && stops.length > 0 && stops.every(isStopEntry),
      ),
  );
}

// Snapshot is refreshed by `bun run data:bus-routes` (also run by `bun run deploy`).
if (!validateBusRoutesSnapshot(busRoutesData)) {
  throw new Error("Invalid bus routes snapshot (public/bus-routes.json)");
}
export const BUS_ROUTES_SNAPSHOT = busRoutesData as BusRoutesSnapshot;
