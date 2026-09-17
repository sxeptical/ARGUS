/**
 * Shared display formatters. Previously duplicated (under different names)
 * across app/page.tsx, FlightPanel, NewsPanel, and WeatherPanel.
 */

export function formatSgTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-SG", {
    timeZone: "Asia/Singapore",
  });
}

// Date + time for published/updated stamps: bare times collide across days
// (e.g. news items from yesterday read the same as today's).
export function formatSgDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Singapore",
  });
}

export function formatSpeedKmh(speed: number | null): string {
  if (!Number.isFinite(speed)) return "N/A";
  return `${Math.round((speed as number) * 3.6)} km/h`;
}

export function formatAltitudeFeet(altitude: number | null): string {
  if (!Number.isFinite(altitude)) return "N/A";
  return `${Math.round((altitude as number) * 3.28084).toLocaleString()} ft`;
}
