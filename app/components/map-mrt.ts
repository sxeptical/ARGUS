import type { Map as MapLibreMap } from "maplibre-gl";
import { MRT_LINES, MRT_LINE_BY_NAME } from "@/lib/mrt-network";
import {
  isRouteableMrtStation,
  type MrtRouteSegment,
} from "@/lib/mrt-routing";

export type MrtLinesGeoJson = {
  readonly type: "FeatureCollection";
  readonly features: ReadonlyArray<{
    readonly type: "Feature";
    readonly properties: {
      readonly name: string;
      readonly color: string;
      readonly status: "operational" | "future";
    };
    readonly geometry: {
      readonly type: "LineString";
      readonly coordinates: ReadonlyArray<readonly [number, number]>;
    };
  }>;
};

export type MrtStationsGeoJson = {
  readonly type: "FeatureCollection";
  readonly features: ReadonlyArray<{
    readonly type: "Feature";
    readonly properties: {
      readonly name: string;
      readonly label: string;
      readonly line: string;
      readonly color: string;
      readonly routeable: boolean;
    };
    readonly geometry: {
      readonly type: "Point";
      readonly coordinates: readonly [number, number];
    };
  }>;
};

export type MrtRouteGeoJson = {
  readonly type: "FeatureCollection";
  readonly features: ReadonlyArray<{
    readonly type: "Feature";
    readonly properties: {
      readonly line: string;
      readonly color: string;
    };
    readonly geometry: {
      readonly type: "LineString";
      readonly coordinates: ReadonlyArray<readonly [number, number]>;
    };
  }>;
};

export const MRT_LINES_GEOJSON: MrtLinesGeoJson = {
  type: "FeatureCollection",
  features: MRT_LINES.map((line) => ({
    type: "Feature",
    properties: {
      name: line.name,
      color: line.color,
      status: line.status,
    },
    geometry: {
      type: "LineString",
      coordinates: line.stations.map((station) => station.coordinates),
    },
  })),
};

function buildStationsGeoJson(): MrtStationsGeoJson {
  const labelled = new Set<string>();
  return {
    type: "FeatureCollection",
    features: MRT_LINES.flatMap((line) =>
      line.stations.map((station) => {
        const key = station.name.toLowerCase();
        const label = labelled.has(key) ? "" : station.name;
        labelled.add(key);
        return {
          type: "Feature" as const,
          properties: {
            name: station.name,
            label,
            line: line.name,
            color: line.color,
            routeable: isRouteableMrtStation(station.name),
          },
          geometry: {
            type: "Point" as const,
            coordinates: station.coordinates,
          },
        };
      }),
    ),
  };
}

export const MRT_STATIONS_GEOJSON = buildStationsGeoJson();

export function buildMrtRouteGeoJson(
  routeSegments: ReadonlyArray<MrtRouteSegment>,
): MrtRouteGeoJson {
  const features: Array<MrtRouteGeoJson["features"][number]> = [];

  for (const segment of routeSegments) {
    if (segment.stops <= 0) continue;
    const line = MRT_LINE_BY_NAME.get(segment.line);
    if (!line) continue;

    const fromIndex = line.stations.findIndex(
      (station) => station.name === segment.from,
    );
    const toIndex = line.stations.findIndex(
      (station) => station.name === segment.to,
    );
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) continue;

    const start = Math.min(fromIndex, toIndex);
    const end = Math.max(fromIndex, toIndex);
    const sliced = line.stations
      .slice(start, end + 1)
      .map((station) => station.coordinates);
    const coordinates = fromIndex <= toIndex ? sliced : [...sliced].reverse();
    if (coordinates.length < 2) continue;

    features.push({
      type: "Feature",
      properties: { line: line.name, color: line.color },
      geometry: { type: "LineString", coordinates },
    });
  }

  return { type: "FeatureCollection", features };
}

export function applyMrtRouteFocus(
  map: MapLibreMap,
  hasRoute: boolean,
): void {
  if (map.getLayer("mrt-lines-layer")) {
    map.setPaintProperty(
      "mrt-lines-layer",
      "line-opacity",
      hasRoute ? 0.15 : 0.96,
    );
  }
  if (map.getLayer("mrt-lines-casing-layer")) {
    map.setPaintProperty(
      "mrt-lines-casing-layer",
      "line-opacity",
      hasRoute ? 0.12 : 0.84,
    );
  }
  if (map.getLayer("mrt-lines-future-layer")) {
    map.setPaintProperty(
      "mrt-lines-future-layer",
      "line-opacity",
      hasRoute ? 0.08 : 0.82,
    );
  }
  if (map.getLayer("mrt-lines-future-casing-layer")) {
    map.setPaintProperty(
      "mrt-lines-future-casing-layer",
      "line-opacity",
      hasRoute ? 0.07 : 0.72,
    );
  }
  if (map.getLayer("mrt-stations-layer")) {
    map.setPaintProperty("mrt-stations-layer", "circle-opacity", [
      "case",
      ["get", "routeable"],
      hasRoute ? 0.3 : 1,
      hasRoute ? 0.12 : 0.35,
    ]);
  }
  if (map.getLayer("mrt-stations-label-layer")) {
    map.setPaintProperty("mrt-stations-label-layer", "text-opacity", [
      "case",
      ["get", "routeable"],
      hasRoute ? 0.35 : 1,
      hasRoute ? 0.08 : 0.45,
    ]);
  }
}
