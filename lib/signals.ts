import type { TrafficIncident, TrainServiceAlert, WeatherData } from "@/types";

export type SignalRow = {
  category: "rail" | "road" | "weather";
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

export function buildSignalDigest(input: {
  trainAlerts: TrainServiceAlert[];
  incidents: TrafficIncident[];
  weather: WeatherData;
}): SignalRow[] {
  const rail = input.trainAlerts
    .filter((alert) => alert.status === "disrupted")
    .map((alert) => ({
      category: "rail" as const,
      tone: "danger" as const,
      text: `${alert.affectedLines.length > 0 ? alert.affectedLines.join(", ") : "MRT Network"}: ${conciseMessage(alert.message)}`,
    }));
  const road = input.incidents.map((incident) => ({
    category: "road" as const,
    tone: incidentTone(incident.type),
    text: incident.message,
  }));
  const weather =
    input.weather.psiStatus === "Unhealthy"
      ? [{
          category: "weather" as const,
          tone: "danger" as const,
          text: `PSI ${input.weather.psi ?? "N/A"} (Unhealthy)`,
        }]
      : [];
  return [...rail, ...road, ...weather];
}
