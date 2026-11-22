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
/**
 * An area stays heavy this long after its last heavy 15 minutes, so a storm
 * hovering around the threshold is one alert rather than several.
 */
export const HEAVY_RAIN_HOLD_MS = 30 * 60 * 1000;
/** Readings the rain stats need: the hold, plus one window behind it. */
export const RAIN_LOOKBACK_MS = HEAVY_RAIN_HOLD_MS + RAIN_WINDOW_MS;
/**
 * Both feeds publish every few minutes, even when calm. A newest record older
 * than this means the feed has stalled, so its stats are unknown, not zero.
 */
export const FEED_STALE_MS = 20 * 60 * 1000;

const newestTime = (times: ReadonlyArray<number>): number | null => {
  const finite = times.filter(Number.isFinite);
  return finite.length > 0 ? Math.max(...finite) : null;
};

const roundMm = (mm: number) => Math.round(mm * 10) / 10;

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

/** Null when the feed has stalled: no strikes in old data is not calm. */
export function summarizeLightning(
  response: DataGovLightningResponse,
  areas: ReadonlyArray<ForecastArea>,
  now: number,
): LightningStats | null {
  const latest = newestTime(response.data.records.map((record) => Date.parse(record.datetime)));
  if (latest === null || now - latest > FEED_STALE_MS) return null;
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

/**
 * Current 15-minute gauge totals, plus each gauge's wettest 15 minutes over
 * the heavy-rain hold. Null when the feed has stalled.
 */
export function summarizeRain(
  response: DataGovRainfallResponse,
  areas: ReadonlyArray<ForecastArea>,
  now: number,
): RainStats | null {
  const readings = response.data.readings
    .map((reading) => ({ time: Date.parse(reading.timestamp), data: reading.data }))
    .filter((reading) => Number.isFinite(reading.time));
  const latest = newestTime(readings.map((reading) => reading.time));
  if (latest === null || now - latest > FEED_STALE_MS) return null;
  // Windows end on readings, not the clock, so a late feed still sums three
  // readings rather than none.
  const totalsEndingAt = (end: number): Map<string, number> => {
    const totals = new Map<string, number>();
    for (const reading of readings) {
      if (reading.time > end || end - reading.time >= RAIN_WINDOW_MS) continue;
      for (const { stationId, value } of reading.data) {
        if (Number.isFinite(value)) totals.set(stationId, (totals.get(stationId) ?? 0) + value);
      }
    }
    return totals;
  };
  const totals = totalsEndingAt(latest);
  const peaks = new Map<string, number>();
  const holdEnds = new Set(readings.map((reading) => reading.time).filter((time) => latest - time < HEAVY_RAIN_HOLD_MS));
  for (const end of holdEnds) {
    for (const [stationId, total] of totalsEndingAt(end)) {
      peaks.set(stationId, Math.max(peaks.get(stationId) ?? 0, total));
    }
  }

  const stations = new Map(response.data.stations.map((station) => [station.id, station.location ?? station.labelLocation]));
  const areaOf = (stationId: string): string | null => {
    const location = stations.get(stationId);
    return location ? nearestArea(areas, location.latitude, location.longitude) : null;
  };
  const raining = new Map<string, number>();
  let rainingStations = 0;
  let maxMm = 0;
  for (const [stationId, total] of totals) {
    if (total <= 0) continue;
    rainingStations += 1;
    maxMm = Math.max(maxMm, total);
    const area = areaOf(stationId);
    if (area) raining.set(area, Math.max(raining.get(area) ?? 0, total));
  }
  const heavy = new Map<string, number>();
  let peakMm = 0;
  for (const [stationId, peak] of peaks) {
    peakMm = Math.max(peakMm, peak);
    const area = peak >= HEAVY_RAIN_MM ? areaOf(stationId) : null;
    if (area) heavy.set(area, Math.max(heavy.get(area) ?? 0, peak));
  }
  return {
    observedAt: new Date(latest).toISOString(),
    stationCount: totals.size,
    rainingStations,
    maxMm: roundMm(maxMm),
    peakMm: roundMm(peakMm),
    rainingAreas: rankedNames(raining),
    heavyAreas: rankedNames(heavy),
  };
}

/** Singapore's calendar date, which the v2 `date` parameter expects. */
export const singaporeDate = (now: number): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore" }).format(now);
