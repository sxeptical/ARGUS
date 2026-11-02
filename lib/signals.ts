import type { TrafficIncident, TrainServiceAlert, WeatherData } from "@/types";

export type SignalCategory = "rail" | "road" | "weather";

export type SignalRow = {
  /** Stable across polls, so notifications can tell new signals from known ones. */
  id: string;
  category: SignalCategory;
  tone: "danger" | "warning" | "info" | "muted";
  text: string;
};

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
  return [...rail, ...road, ...weather];
}
