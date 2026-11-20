import type { TrafficIncident, TrainServiceAlert, WeatherAlerts, WeatherData } from "@/types";

export type SignalCategory = "rail" | "road" | "weather" | "storm";

export type SignalRow = {
  /** Stable across polls, so notifications can tell new signals from known ones. */
  id: string;
  category: SignalCategory;
  tone: "danger" | "warning" | "info" | "muted";
  text: string;
  /** Alert heading when the category covers several kinds, e.g. lightning vs rain. */
  title?: string;
};

const listAreas = (areas: readonly string[]): string => {
  if (areas.length === 0) return "Singapore";
  if (areas.length <= 3) return areas.join(", ");
  return `${areas.slice(0, 3).join(", ")} +${areas.length - 3} more`;
};

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

// Ids are fixed per kind: a storm is one alert while it lasts, and a new one
// only after it has cleared.
function stormSignals(alerts: WeatherAlerts | undefined): SignalRow[] {
  const rows: SignalRow[] = [];
  const lightning = alerts?.lightning;
  if (lightning && lightning.strikes > 0) {
    rows.push({
      id: "storm:lightning",
      category: "storm",
      title: "Lightning",
      // Cloud-to-ground strikes are the ones that hit people outdoors.
      tone: lightning.groundStrikes > 0 ? "danger" : "warning",
      text: `Near ${listAreas(lightning.areas)}: ${plural(lightning.strikes, "strike")}${
        lightning.groundStrikes > 0 ? ` (${lightning.groundStrikes} to ground)` : ""
      } in 30 min`,
    });
  }
  const rain = alerts?.rain;
  // The wettest gauge is also the heaviest, so `maxMm` is the heavy total.
  if (rain && rain.heavyAreas.length > 0) {
    rows.push({
      id: "storm:heavy-rain",
      category: "storm",
      title: "Heavy rain",
      tone: "warning",
      text: `${listAreas(rain.heavyAreas)}: up to ${rain.maxMm} mm in 15 min`,
    });
  }
  return rows;
}

function conciseMessage(message: string): string {
  const fragment = message.trim().split(/[.!?](?:\s|$)/, 1)[0]?.trim() ?? "";
  return (fragment || message.trim()).slice(0, 100);
}

function incidentTone(type: string): SignalRow["tone"] {
  if (type === "Accident") return "danger";
  if (type === "Vehicle Breakdown" || type === "Heavy Traffic") return "warning";
  return "muted";
}

// The message is left out because LTA rewords it as a disruption progresses.
function railSignalId(alert: TrainServiceAlert): string {
  const lines =
    alert.affectedLines.length > 0
      ? [...alert.affectedLines].sort().join(",")
      : "network";
  return `rail:${lines}:${alert.startTime ?? "unknown"}`;
}

export function buildSignalDigest(input: {
  trainAlerts: TrainServiceAlert[];
  incidents: TrafficIncident[];
  weather: WeatherData;
  weatherAlerts?: WeatherAlerts;
}): SignalRow[] {
  const rail = input.trainAlerts
    .filter((alert) => alert.status === "disrupted")
    .map((alert) => ({
      id: railSignalId(alert),
      category: "rail" as const,
      tone: "danger" as const,
      text: `${alert.affectedLines.length > 0 ? alert.affectedLines.join(", ") : "MRT Network"}: ${conciseMessage(alert.message)}`,
    }));
  const road = input.incidents.map((incident) => ({
    id: `road:${incident.id}`,
    category: "road" as const,
    tone: incidentTone(incident.type),
    text: incident.message,
  }));
  const { psi, psiStatus } = input.weather;
  // NEA's "Unhealthy" starts above PSI 100; alert from there upwards.
  const weather =
    psi !== null && psi > 100
      ? [{
          // Not keyed on the reading, so only crossing the threshold is new.
          id: "weather:psi-unhealthy",
          category: "weather" as const,
          tone: "danger" as const,
          text: `PSI ${psi} (${psiStatus})`,
        }]
      : [];
  // Storms sit right after rail: they outrank a long list of road incidents.
  return [...rail, ...stormSignals(input.weatherAlerts), ...road, ...weather];
}
