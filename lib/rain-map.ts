/**
 * Spatial helpers for the Rain & Lightning minimap and main map overlay.
 * Maps NEA forecast/storm area names onto coordinates and URA planning area
 * geometries, projecting all 47 areas into a compact SVG viewBox.
 */
import { FALLBACK_FORECAST_AREAS } from "@/lib/data/forecast-areas";
import {
  FORECAST_AREA_GEOMETRY_BY_NAME,
  type ForecastAreaGeometry,
} from "@/lib/data/forecast-areas-geometry";
import { clipGeometryToRadius, distanceM, type GeoFilter } from "@/lib/geo-filter";
import { isThunderyForecast } from "@/lib/rain-outlook";
import type {
  RainMapAreaPoint,
  RainMapTone,
  RainMapWindow,
  RainOutlook,
  WeatherAlerts,
} from "@/types";

export const MINIMAP_WIDTH = 220;
export const MINIMAP_HEIGHT = 126;

const MIN_LNG = 103.605;
const MAX_LNG = 104.09;
const MIN_LAT = 1.195;
const MAX_LAT = 1.472;
const PAD_X = 6;
const PAD_Y = 6;
const METRES_PER_LAT_DEG = 110_574;
const METRES_PER_LNG_DEG_AT_EQUATOR = 111_320;

/** Project `[lat, lng]` into the minimap SVG coordinate space. */
export function projectToMinimap(lat: number, lng: number): { x: number; y: number } {
  const usableW = MINIMAP_WIDTH - PAD_X * 2;
  const usableH = MINIMAP_HEIGHT - PAD_Y * 2;
  const x = PAD_X + ((lng - MIN_LNG) / (MAX_LNG - MIN_LNG)) * usableW;
  const y = PAD_Y + ((MAX_LAT - lat) / (MAX_LAT - MIN_LAT)) * usableH;
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
  };
}

/** Project a `GeoFilter` circle into an ellipse in the minimap SVG coordinate space. */
export function geoFilterToMinimapEllipse(geoFilter: GeoFilter): {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
} {
  const [lng, lat] = geoFilter.center;
  const center = projectToMinimap(lat, lng);
  const dLat = geoFilter.radiusM / METRES_PER_LAT_DEG;
  const dLng =
    geoFilter.radiusM /
    (METRES_PER_LNG_DEG_AT_EQUATOR * Math.cos((lat * Math.PI) / 180));
  const east = projectToMinimap(lat, lng + dLng);
  const north = projectToMinimap(lat + dLat, lng);
  return {
    cx: center.x,
    cy: center.y,
    rx: Math.max(2, Math.round(Math.abs(east.x - center.x) * 10) / 10),
    ry: Math.max(2, Math.round(Math.abs(center.y - north.y) * 10) / 10),
  };
}

function ringToSvgPath(ring: ReadonlyArray<ReadonlyArray<number>>): string {
  if (ring.length < 3) return "";
  const parts: string[] = [];
  for (let i = 0; i < ring.length; i += 1) {
    const [lng, lat] = ring[i];
    const { x, y } = projectToMinimap(lat, lng);
    parts.push(`${i === 0 ? "M" : "L"}${x} ${y}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/** Project a Polygon/MultiPolygon geometry into an SVG path string. */
export function geometryToSvgPath(geometry: ForecastAreaGeometry): string {
  const rings =
    geometry.type === "Polygon"
      ? geometry.coordinates
      : geometry.coordinates.flat();
  return rings.map(ringToSvgPath).filter(Boolean).join(" ");
}

export type MinimapAreaDot = {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly x: number;
  readonly y: number;
  readonly svgPath: string;
  readonly inRadius: boolean;
  readonly active: RainMapAreaPoint | null;
};

const BASE_AREA_PATCHES = FALLBACK_FORECAST_AREAS.map((area) => {
  const geometry = FORECAST_AREA_GEOMETRY_BY_NAME.get(area.name.toLowerCase());
  return {
    ...area,
    ...projectToMinimap(area.lat, area.lng),
    svgPath: geometry ? geometryToSvgPath(geometry) : "",
  };
});

const AREA_BY_LOWER = new Map(
  FALLBACK_FORECAST_AREAS.map((area) => [area.name.toLowerCase(), area]),
);

const TONE_RANK: Record<RainMapTone, number> = {
  info: 1,
  warning: 2,
  danger: 3,
};

/** True when the forecast area's polygon (or center point fallback) touches `geoFilter`. */
export function areaTouchesGeoFilter(
  areaName: string,
  lat: number,
  lng: number,
  geoFilter: GeoFilter | null | undefined,
): boolean {
  if (!geoFilter) return true;
  const geometry = FORECAST_AREA_GEOMETRY_BY_NAME.get(areaName.toLowerCase());
  if (geometry) {
    return clipGeometryToRadius(geoFilter, geometry) !== null;
  }
  return distanceM(geoFilter.center, [lng, lat]) <= geoFilter.radiusM;
}

/** Filter a list of NEA forecast area names to those touching `geoFilter`. */
export function filterAreaNamesByGeoFilter(
  names: ReadonlyArray<string>,
  geoFilter: GeoFilter | null | undefined,
): string[] {
  if (!geoFilter) return [...names];
  return names.filter((name) => {
    const area = AREA_BY_LOWER.get(name.toLowerCase());
    if (!area) return false;
    return areaTouchesGeoFilter(area.name, area.lat, area.lng, geoFilter);
  });
}

/**
 * Resolve active rain/lightning areas onto NEA's 47 forecast areas and patches.
 * When `geoFilter` is set, only areas touching the radius are marked active.
 */
export function buildRainMapData(
  window: RainMapWindow,
  storms: WeatherAlerts,
  outlook: RainOutlook,
  geoFilter: GeoFilter | null = null,
): {
  dots: MinimapAreaDot[];
  active: RainMapAreaPoint[];
  inRadiusCount: number;
} {
  const activeByName = new Map<string, RainMapAreaPoint>();
  const inRadiusByLower = new Map<string, boolean>();
  let inRadiusCount = 0;

  for (const area of BASE_AREA_PATCHES) {
    const inside = areaTouchesGeoFilter(area.name, area.lat, area.lng, geoFilter);
    inRadiusByLower.set(area.name.toLowerCase(), inside);
    if (inside) inRadiusCount += 1;
  }

  if (window === "now") {
    const heavySet = new Set(
      (storms.rain?.heavyAreas ?? []).map((name) => name.toLowerCase()),
    );
    const rainSet = new Set(
      (storms.rain?.rainingAreas ?? []).map((name) => name.toLowerCase()),
    );
    const lightningSet = new Set(
      (storms.lightning?.areas ?? []).map((name) => name.toLowerCase()),
    );
    const lightningTone: RainMapTone =
      (storms.lightning?.groundStrikes ?? 0) > 0 ? "danger" : "warning";

    for (const area of BASE_AREA_PATCHES) {
      const key = area.name.toLowerCase();
      if (!inRadiusByLower.get(key)) continue;
      const hasLightning = lightningSet.has(key);
      const hasHeavy = heavySet.has(key);
      const hasRain = rainSet.has(key);
      if (!hasLightning && !hasHeavy && !hasRain) continue;

      const labels: string[] = [];
      if (hasLightning) labels.push("Lightning");
      if (hasHeavy) labels.push("Heavy rain");
      else if (hasRain) labels.push("Raining");

      const tone: RainMapTone = hasLightning
        ? lightningTone
        : hasHeavy
          ? "warning"
          : "info";

      activeByName.set(key, {
        name: area.name,
        lat: area.lat,
        lng: area.lng,
        tone,
        label: labels.join(" · "),
        lightning: hasLightning,
      });
    }
  } else {
    const forecastByName = new Map(
      (outlook.nextTwoHours?.rain ?? []).map((entry) => [
        entry.place.toLowerCase(),
        entry.forecast,
      ]),
    );
    for (const area of BASE_AREA_PATCHES) {
      const key = area.name.toLowerCase();
      if (!inRadiusByLower.get(key)) continue;
      const forecast = forecastByName.get(key);
      if (!forecast) continue;
      const thundery = isThunderyForecast(forecast);
      activeByName.set(key, {
        name: area.name,
        lat: area.lat,
        lng: area.lng,
        tone: thundery ? "warning" : "info",
        label: forecast,
        lightning: thundery,
      });
    }
  }

  const dots: MinimapAreaDot[] = BASE_AREA_PATCHES.map((area) => {
    const key = area.name.toLowerCase();
    return {
      name: area.name,
      lat: area.lat,
      lng: area.lng,
      x: area.x,
      y: area.y,
      svgPath: area.svgPath,
      inRadius: inRadiusByLower.get(key) ?? true,
      active: activeByName.get(key) ?? null,
    };
  }).sort((a, b) => {
    const rankA = a.active ? TONE_RANK[a.active.tone] : a.inRadius ? 0 : -1;
    const rankB = b.active ? TONE_RANK[b.active.tone] : b.inRadius ? 0 : -1;
    return rankA - rankB;
  });

  const active = [...activeByName.values()].sort(
    (a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone] || a.name.localeCompare(b.name, "en-SG"),
  );

  return { dots, active, inRadiusCount };
}
