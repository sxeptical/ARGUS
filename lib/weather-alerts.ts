/**
 * Lightning and rainfall stats from NEA's real-time feeds, and the thresholds
 * that turn them into alerts. Pure, so they are unit-testable;
 * lib/api-clients/weather.ts does the fetching.
 */
import { distanceM } from "@/lib/geo-filter";
import type {
  DataGovLightningResponse,
  DataGovRainfallResponse,
} from "@/types/schemas";
import type { LightningStats, RainStats } from "@/types";

export type ForecastArea = { readonly name: string; readonly lat: number; readonly lng: number };

/** Strikes in this window keep the alert up, so a storm doesn't flicker between polls. */
export const LIGHTNING_WINDOW_MS = 30 * 60 * 1000;
/** NEA's feed covers the region; only strikes this close to a forecast area count. */
export const LIGHTNING_NEAR_M = 8_000;
/** Gauge totals are summed over this window (three five-minute readings). */
export const RAIN_WINDOW_MS = 15 * 60 * 1000;
/** 5 mm in 15 minutes is a sustained 20 mm/h, well into heavy rain. */
export const HEAVY_RAIN_MM = 5;

/** The forecast area nearest a point, or null when none is within `maxM`. */
export function nearestArea(
  areas: ReadonlyArray<ForecastArea>,
  lat: number,
  lng: number,
  maxM = Number.POSITIVE_INFINITY,
): string | null {
  let best: { name: string; distance: number } | null = null;
  for (const area of areas) {
    const distance = distanceM([lng, lat], [area.lng, area.lat]);
    if (distance <= maxM && (!best || distance < best.distance)) best = { name: area.name, distance };
  }
  return best?.name ?? null;
}

const rankedNames = (counts: ReadonlyMap<string, number>): string[] =>
  [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en-SG")).map(([name]) => name);

export function summarizeLightning(
  response: DataGovLightningResponse,
  areas: ReadonlyArray<ForecastArea>,
  now: number,
): LightningStats {
  const byArea = new Map<string, number>();
  let strikes = 0;
  let groundStrikes = 0;
  let lastStrikeAt: string | null = null;
  for (const record of response.data.records) {
    for (const reading of record.item.readings ?? []) {
      const at = reading.datetime ?? record.datetime;
      const time = Date.parse(at);
      if (!Number.isFinite(time) || now - time > LIGHTNING_WINDOW_MS) continue;
      const lat = reading.location.latitude;
      const lng = reading.location.longitude ?? reading.location.longtitude;
      if (lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const area = nearestArea(areas, lat, lng, LIGHTNING_NEAR_M);
      if (!area) continue;
      strikes += 1;
      if (reading.type === "G") groundStrikes += 1;
      byArea.set(area, (byArea.get(area) ?? 0) + 1);
      if (!lastStrikeAt || time > Date.parse(lastStrikeAt)) lastStrikeAt = at;
    }
  }
  return { strikes, groundStrikes, areas: rankedNames(byArea), lastStrikeAt };
}

export function summarizeRain(
  response: DataGovRainfallResponse,
  areas: ReadonlyArray<ForecastArea>,
): RainStats {
  const readings = response.data.readings;
  const times = readings.map((reading) => Date.parse(reading.timestamp)).filter(Number.isFinite);
  const latest = times.length > 0 ? Math.max(...times) : null;
  // Anchored on the newest reading, not the clock, so a late feed still sums
  // three readings rather than none.
  const totals = new Map<string, number>();
  for (const reading of readings) {
    if (latest === null || latest - Date.parse(reading.timestamp) >= RAIN_WINDOW_MS) continue;
    for (const { stationId, value } of reading.data) {
      if (Number.isFinite(value)) totals.set(stationId, (totals.get(stationId) ?? 0) + value);
    }
  }
  const stations = new Map(response.data.stations.map((station) => [station.id, station.location ?? station.labelLocation]));
  const raining = new Map<string, number>();
  const heavy = new Map<string, number>();
  let rainingStations = 0;
  let maxMm = 0;
  for (const [stationId, total] of totals) {
    if (total <= 0) continue;
    rainingStations += 1;
    maxMm = Math.max(maxMm, total);
    const location = stations.get(stationId);
    const area = location ? nearestArea(areas, location.latitude, location.longitude) : null;
    if (!area) continue;
    raining.set(area, Math.max(raining.get(area) ?? 0, total));
    if (total >= HEAVY_RAIN_MM) heavy.set(area, Math.max(heavy.get(area) ?? 0, total));
  }
  return {
    observedAt: latest === null ? null : new Date(latest).toISOString(),
    stationCount: totals.size,
    rainingStations,
    maxMm: Math.round(maxMm * 10) / 10,
    rainingAreas: rankedNames(raining),
    heavyAreas: rankedNames(heavy),
  };
}

/** Singapore's calendar date, which the v2 `date` parameter expects. */
export const singaporeDate = (now: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
