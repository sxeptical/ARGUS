/**
 * Pure GeoJSON builders extracted from `app/components/Map.tsx`.
 *
 * Map.tsx was 1674 lines mixing basemap theming, GeoJSON construction, and
 * MapLibre lifecycle. These builders are framework-free so they can be
 * unit-tested without a browser.
 */
import { isRouteableMrtStation, type MrtRouteSegment } from "@/lib/mrt-routing";
import type { BusRouteStop, MRTGeoJson } from "@/types";

/** Active bus service route drawn as road-following (or stop-chord) polylines. */
export type BusRouteOverlay = {
  serviceNo: string;
  direction: number;
  stops: ReadonlyArray<BusRouteStop>;
  /** Index into `stops` for the selected stop (stop-chord fallback). */
  selectedStopIndex: number | null;
  /**
   * Road-following polyline [lng, lat] when available. Empty → fall back to
   * connecting `stops` with straight segments.
   */
  path: ReadonlyArray<readonly [number, number]>;
  /** Index into `path` nearest the selected stop for remaining-path emphasis. */
  selectedPathIndex: number | null;
};

export type BusRouteLineGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      kind: "remaining";
      serviceNo: string;
    };
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  }>;
};

export type BusRouteStopsGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      BusStopCode: string;
      Description: string;
      role: "selected" | "terminus" | "stop";
      sequence: number;
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
  }>;
};

export const EMPTY_BUS_ROUTE_GEOJSON: BusRouteLineGeoJson = {
  type: "FeatureCollection",
  features: [],
};

export const EMPTY_BUS_ROUTE_STOPS_GEOJSON: BusRouteStopsGeoJson = {
  type: "FeatureCollection",
  features: [],
};

export type MRTStationGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      name: string;
      label: string;
      line: string;
      color: string;
      routeable: boolean;
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
  }>;
};

export type MRTRouteGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      line: string;
      color: string;
    };
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
  }>;
};

/**
 * Resolve the polyline to draw for a bus route overlay.
 *
 * When the user selected a stop, only the remaining segment from that stop
 * to the terminus is returned (not the full outbound+return geometry, and
 * not the portion already travelled).
 */
export function resolveBusRouteDrawPath(
  overlay: BusRouteOverlay,
): Array<[number, number]> {
  const fullCoords: Array<[number, number]> =
    overlay.path.length >= 2
      ? overlay.path.map(([lng, lat]) => [lng, lat])
      : overlay.stops.map(
          (stop) => [stop.longitude, stop.latitude] as [number, number],
        );

  if (fullCoords.length < 2) return [];

  // Prefer path index (road geometry); fall back to stop index (chords).
  const startIdx =
    overlay.path.length >= 2
      ? overlay.selectedPathIndex
      : overlay.selectedStopIndex;

  if (startIdx !== null && startIdx >= 0 && startIdx < fullCoords.length - 1) {
    return fullCoords.slice(startIdx);
  }

  // No stop context (or stop is the terminus) → full active direction only.
  return fullCoords;
}

/** Stops on the remaining path (selected stop → terminus), inclusive. */
export function resolveRemainingRouteStops(
  overlay: BusRouteOverlay,
): ReadonlyArray<BusRouteStop> {
  if (overlay.stops.length === 0) return [];
  const startIdx =
    overlay.selectedStopIndex !== null &&
    overlay.selectedStopIndex >= 0 &&
    overlay.selectedStopIndex < overlay.stops.length
      ? overlay.selectedStopIndex
      : 0;
  return overlay.stops.slice(startIdx);
}

export function buildBusRouteGeoJson(
  overlay: BusRouteOverlay | null | undefined,
): BusRouteLineGeoJson {
  if (!overlay || (overlay.path.length < 2 && overlay.stops.length < 2)) {
    return { type: "FeatureCollection", features: [] };
  }

  const drawCoords = resolveBusRouteDrawPath(overlay);
  if (drawCoords.length < 2) {
    return { type: "FeatureCollection", features: [] };
  }

  // Single polyline only — remaining path from selected stop to destination.
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "remaining", serviceNo: overlay.serviceNo },
        geometry: { type: "LineString", coordinates: drawCoords },
      },
    ],
  };
}

export function buildBusRouteStopsGeoJson(
  overlay: BusRouteOverlay | null | undefined,
): BusRouteStopsGeoJson {
  if (!overlay) return EMPTY_BUS_ROUTE_STOPS_GEOJSON;
  const remaining = resolveRemainingRouteStops(overlay);
  if (remaining.length === 0) return EMPTY_BUS_ROUTE_STOPS_GEOJSON;

  const lastIdx = remaining.length - 1;
  return {
    type: "FeatureCollection",
    features: remaining.flatMap((stop, index) => {
      if (
        !Number.isFinite(stop.latitude) ||
        !Number.isFinite(stop.longitude)
      ) {
        return [];
      }
      const role: "selected" | "terminus" | "stop" =
        index === 0
          ? "selected"
          : index === lastIdx
            ? "terminus"
            : "stop";
      return [
        {
          type: "Feature" as const,
          properties: {
            BusStopCode: stop.busStopCode,
            Description: stop.description,
            role,
            sequence: stop.stopSequence,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [stop.longitude, stop.latitude] as [number, number],
          },
        },
      ];
    }),
  };
}

/**
 * Station positions are approximate: when the line geometry vertex count
 * matches the station count (the common case — the GeoJSON was authored with
 * one vertex per station), vertices are used directly. Otherwise stations are
 * distributed evenly along the polyline. For precise platform coordinates a
 * dedicated `mrt-stations.json` with surveyed positions should replace this.
 */
export function interpolateStations(
  coordinates: number[][],
  stationNames: string[],
  line: string,
  color: string,
): MRTStationGeoJson["features"] {
  if (coordinates.length < 2 || stationNames.length === 0) return [];
  if (coordinates.length === stationNames.length) {
    return stationNames.map((stationName, index) => {
      const [lng, lat] = coordinates[index];
      return {
        type: "Feature" as const,
        properties: {
          name: stationName,
          label: stationName,
          line,
          color,
          routeable: isRouteableMrtStation(stationName),
        },
        geometry: {
          type: "Point" as const,
          coordinates: [lng, lat] as [number, number],
        },
      };
    });
  }

  if (stationNames.length === 1) {
    const [lng, lat] = coordinates[0];
    return [
      {
        type: "Feature",
        properties: {
          name: stationNames[0],
          label: stationNames[0],
          line,
          color,
          routeable: isRouteableMrtStation(stationNames[0]),
        },
        geometry: {
          type: "Point",
          coordinates: [lng, lat],
        },
      },
    ];
  }

  const segmentLengths: number[] = [];
  let totalLength = 0;

  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[i + 1];
    const segmentLength = Math.hypot(lng2 - lng1, lat2 - lat1);
    segmentLengths.push(segmentLength);
    totalLength += segmentLength;
  }

  if (totalLength === 0) return [];

  return stationNames.map((stationName, index) => {
    const targetDistance = (totalLength * index) / (stationNames.length - 1);
    let traversed = 0;
    let segmentIndex = 0;

    while (
      segmentIndex < segmentLengths.length - 1 &&
      traversed + segmentLengths[segmentIndex] < targetDistance
    ) {
      traversed += segmentLengths[segmentIndex];
      segmentIndex += 1;
    }

    const currentSegmentLength = segmentLengths[segmentIndex];
    const ratio =
      currentSegmentLength > 0
        ? (targetDistance - traversed) / currentSegmentLength
        : 0;

    const [startLng, startLat] = coordinates[segmentIndex];
    const [endLng, endLat] = coordinates[segmentIndex + 1];
    const lng = startLng + (endLng - startLng) * ratio;
    const lat = startLat + (endLat - startLat) * ratio;

    return {
      type: "Feature" as const,
      properties: {
        name: stationName,
        label: stationName,
        line,
        color,
        routeable: isRouteableMrtStation(stationName),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [lng, lat] as [number, number],
      },
    };
  });
}

export function buildRouteGeoJson(
  mrtLines: MRTGeoJson,
  routeSegments: MrtRouteSegment[],
  stationLookup: Record<string, string[]>,
): MRTRouteGeoJson {
  const features: MRTRouteGeoJson["features"] = [];
  const lineFeaturesByName = new globalThis.Map(
    mrtLines.features.map((feature) => [feature.properties.name, feature]),
  );

  for (const segment of routeSegments) {
    if (segment.stops <= 0) continue;
    const lineFeature = lineFeaturesByName.get(segment.line);
    if (!lineFeature) continue;

    const stationNames = stationLookup[segment.line] ?? [];
    if (stationNames.length === 0) continue;

    const stationFeatures = interpolateStations(
      lineFeature.geometry.coordinates,
      stationNames,
      segment.line,
      lineFeature.properties.color,
    );
    if (stationFeatures.length !== stationNames.length) continue;

    const fromIndex = stationNames.indexOf(segment.from);
    const toIndex = stationNames.indexOf(segment.to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) continue;

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);
    const sliced = stationFeatures
      .slice(startIndex, endIndex + 1)
      .map((feature) => feature.geometry.coordinates);
    const coordinates = fromIndex <= toIndex ? sliced : [...sliced].reverse();
    if (coordinates.length < 2) continue;

    features.push({
      type: "Feature",
      properties: {
        line: segment.line,
        color: lineFeature.properties.color,
      },
      geometry: {
        type: "LineString",
        coordinates: coordinates as [number, number][],
      },
    });
  }

  return {
    type: "FeatureCollection",
    features,
  };
}
