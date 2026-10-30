/**
 * Availability bands for the carpark and EV charger map layers. Pure so the
 * map paint, popups, and tests share one definition of "low" and "full".
 */
import type { CarparkAvailability, EvChargingLocation } from "@/types";

export type AvailabilityTone = "success" | "warning" | "danger" | "muted";

/** At or below this many free car lots a carpark is shown as filling up. */
export const CARPARK_LOW_LOTS = 20;

/** Car lots drive the tone; motorcycle-/heavy-only carparks stay neutral. */
export const carparkTone = (carpark: CarparkAvailability): AvailabilityTone => {
  if (carpark.carLots === null) return "muted";
  if (carpark.carLots === 0) return "danger";
  if (carpark.carLots <= CARPARK_LOW_LOTS) return "warning";
  return "success";
};

/** Any free connector is good; all reporting connectors busy is a warning. */
export const evChargerTone = (location: EvChargingLocation): AvailabilityTone => {
  if (location.available > 0) return "success";
  if (location.occupied > 0) return "warning";
  return "muted";
};

/** One line of a map hover popup; `kind` picks its emphasis. */
export type PopupLine = {
  readonly text: string;
  readonly kind: "name" | "status" | "count" | "detail" | "hint";
  readonly tone?: AvailabilityTone;
};

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const CARPARK_STATUS: Record<AvailabilityTone, string> = {
  success: "Spaces available",
  warning: "Filling up",
  danger: "Full",
  muted: "No car lot data",
};

const freeLots = (count: number, vehicle: string) =>
  count === 0 ? `No ${vehicle} lots free` : `${plural(count, `${vehicle} lot`, `${vehicle} lots`)} free`;

/** Plain-language popup lines: status, then free lots per vehicle class. */
export const describeCarpark = (carpark: CarparkAvailability): PopupLine[] => {
  const tone = carparkTone(carpark);
  return [
    { text: carpark.name, kind: "name" },
    { text: CARPARK_STATUS[tone], kind: "status", tone },
    ...(carpark.carLots === null ? [] : [{ text: freeLots(carpark.carLots, "car"), kind: "count" as const }]),
    ...(carpark.motorcycleLots === null ? [] : [{ text: freeLots(carpark.motorcycleLots, "motorcycle"), kind: "detail" as const }]),
    ...(carpark.heavyLots === null ? [] : [{ text: freeLots(carpark.heavyLots, "heavy vehicle"), kind: "detail" as const }]),
    { text: "Live from LTA · updates every minute", kind: "hint" },
  ];
};

/** Plain-language popup lines: free chargers, top speed, then operator. */
export const describeEvCharger = (location: EvChargingLocation): PopupLine[] => {
  const tone = evChargerTone(location);
  const status =
    tone === "success"
      ? `${location.available} of ${plural(location.total, "charger", "chargers")} free`
      : tone === "warning"
        ? location.occupied === location.total
          ? `All ${plural(location.total, "charger", "chargers")} in use`
          : `No free chargers · ${location.occupied} in use`
        : "Availability not reported";
  const speed =
    location.maxPowerKw === null
      ? null
      : `Up to ${location.maxPowerKw} kW · ${location.hasDc ? "DC fast charging" : "AC standard charging"}`;
  return [
    { text: location.name, kind: "name" },
    { text: status, kind: "status", tone },
    ...(speed ? [{ text: speed, kind: "detail" as const }] : []),
    ...(location.operators.length ? [{ text: `Run by ${location.operators.join(", ")}`, kind: "detail" as const }] : []),
    { text: "Live from LTA · updates every 5 minutes", kind: "hint" },
  ];
};
