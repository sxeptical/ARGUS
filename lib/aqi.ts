/**
 * US EPA Air Quality Index helpers. Pure and dependency-free so the API
 * client, weather panel, map overlay, and signal digest share one set of
 * breakpoints and bands.
 */
import type { AqiStatus } from "@/types";

type Breakpoint = readonly [
  concLow: number,
  concHigh: number,
  indexLow: number,
  indexHigh: number,
];

// US EPA 2024 AQI breakpoints for PM2.5 (µg/m³).
const US_EPA_PM25_BREAKPOINTS: ReadonlyArray<Breakpoint> = [
  [0, 9.0, 0, 50],
  [9.0, 35.4, 50, 100],
  [35.4, 55.4, 100, 150],
  [55.4, 125.4, 150, 200],
  [125.4, 225.4, 200, 300],
  [225.4, 325.4, 300, 500],
];

/** Converts PM2.5 (µg/m³) into US EPA AQI, capped at 500. */
export const pm25ToAqi = (pm25: number | null): number | null => {
  if (pm25 === null || !Number.isFinite(pm25)) return null;
  const c = Math.max(0, pm25);
  const band =
    US_EPA_PM25_BREAKPOINTS.find(([, high]) => c <= high) ??
    US_EPA_PM25_BREAKPOINTS[US_EPA_PM25_BREAKPOINTS.length - 1];
  const [cLow, cHigh, iLow, iHigh] = band;
  const clamped = Math.min(c, cHigh) - cLow;
  return Math.round(((iHigh - iLow) / (cHigh - cLow)) * clamped + iLow);
};

export const AQI_BANDS: ReadonlyArray<{
  status: Exclude<AqiStatus, "Unknown">;
  shortLabel: string;
  range: string;
  max: number;
}> = [
  { status: "Good", shortLabel: "Good", range: "0–50", max: 50 },
  { status: "Moderate", shortLabel: "Moderate", range: "51–100", max: 100 },
  {
    status: "Unhealthy for Sensitive Groups",
    shortLabel: "Sensitive",
    range: "101–150",
    max: 150,
  },
  { status: "Unhealthy", shortLabel: "Unhealthy", range: "151–200", max: 200 },
  {
    status: "Very Unhealthy",
    shortLabel: "Very Unhealthy",
    range: "201–300",
    max: 300,
  },
  { status: "Hazardous", shortLabel: "Hazardous", range: "301+", max: Infinity },
];

export const getAqiStatus = (aqi: number | null): AqiStatus => {
  if (aqi === null || !Number.isFinite(aqi)) return "Unknown";
  return AQI_BANDS.find((band) => aqi <= band.max)?.status ?? "Hazardous";
};

/** Shared colour tone for an AQI band: Good → success, up to 150 → warning. */
export const aqiTone = (
  status: AqiStatus,
): "success" | "warning" | "danger" | "muted" => {
  switch (status) {
    case "Good":
      return "success";
    case "Moderate":
    case "Unhealthy for Sensitive Groups":
      return "warning";
    case "Unknown":
      return "muted";
    default:
      return "danger";
  }
};
