import { LngLatBounds, type Map as MapLibreMap } from "maplibre-gl";
import type { BusRouteStop } from "@/types";

/** Active bus service route drawn as road-following (or stop-chord) polylines. */
export type BusRouteOverlay = {
  readonly serviceNo: string;
  readonly direction: number;
  readonly stops: ReadonlyArray<BusRouteStop>;
  /** Index into `stops` for the selected stop (stop-chord fallback). */
  readonly selectedStopIndex: number | null;
  /** Road-following polyline as [longitude, latitude] pairs. */
  readonly path: ReadonlyArray<readonly [number, number]>;
  /** Index into `path` nearest the selected stop. */
  readonly selectedPathIndex: number | null;
};

type BusRouteLineGeoJson = {
  readonly type: "FeatureCollection";
  readonly features: ReadonlyArray<{
    readonly type: "Feature";
    readonly properties: {
      readonly kind: "remaining";
      readonly serviceNo: string;
    };
    readonly geometry: {
      readonly type: "LineString";
      readonly coordinates: ReadonlyArray<readonly [number, number]>;
    };
  }>;
};

type BusRouteStopsGeoJson = {
  readonly type: "FeatureCollection";
  readonly features: ReadonlyArray<{
    readonly type: "Feature";
    readonly properties: {
      readonly BusStopCode: string;
      readonly Description: string;
      readonly role: "selected" | "terminus" | "stop";
      readonly sequence: number;
    };
    readonly geometry: {
      readonly type: "Point";
      readonly coordinates: readonly [number, number];
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

/** Remaining polyline from selected stop to terminus, or the full direction. */
function resolveDrawPath(overlay: BusRouteOverlay): Array<[number, number]> {
  const coordinates: Array<[number, number]> =
    overlay.path.length >= 2
      ? overlay.path.map(([longitude, latitude]) => [longitude, latitude])
      : overlay.stops.map((stop) => [stop.longitude, stop.latitude]);
  if (coordinates.length < 2) return [];

  const startIndex =
    overlay.path.length >= 2
      ? overlay.selectedPathIndex
      : overlay.selectedStopIndex;
  return startIndex !== null &&
    startIndex >= 0 &&
    startIndex < coordinates.length - 1
    ? coordinates.slice(startIndex)
    : coordinates;
}

function remainingStops(
  overlay: BusRouteOverlay,
): ReadonlyArray<BusRouteStop> {
  if (overlay.stops.length === 0) return [];
  const startIndex =
    overlay.selectedStopIndex !== null &&
    overlay.selectedStopIndex >= 0 &&
    overlay.selectedStopIndex < overlay.stops.length
      ? overlay.selectedStopIndex
      : 0;
  return overlay.stops.slice(startIndex);
}

export function buildBusRouteGeoJson(
  overlay: BusRouteOverlay | null | undefined,
): BusRouteLineGeoJson {
  if (!overlay || (overlay.path.length < 2 && overlay.stops.length < 2)) {
    return EMPTY_BUS_ROUTE_GEOJSON;
  }
  const coordinates = resolveDrawPath(overlay);
  if (coordinates.length < 2) return EMPTY_BUS_ROUTE_GEOJSON;
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { kind: "remaining", serviceNo: overlay.serviceNo },
        geometry: { type: "LineString", coordinates },
      },
    ],
  };
}

export function buildBusRouteStopsGeoJson(
  overlay: BusRouteOverlay | null | undefined,
): BusRouteStopsGeoJson {
  if (!overlay) return EMPTY_BUS_ROUTE_STOPS_GEOJSON;
  const stops = remainingStops(overlay);
  if (stops.length === 0) return EMPTY_BUS_ROUTE_STOPS_GEOJSON;

  const lastIndex = stops.length - 1;
  return {
    type: "FeatureCollection",
    features: stops.flatMap((stop, index) => {
      if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)) {
        return [];
      }
      const role: "selected" | "terminus" | "stop" =
        index === 0
          ? "selected"
          : index === lastIndex
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
            coordinates: [stop.longitude, stop.latitude] as const,
          },
        },
      ];
    }),
  };
}

export function fitMapToBusRoute(
  map: MapLibreMap,
  overlay: BusRouteOverlay | null | undefined,
): void {
  if (!overlay) return;
  const coordinates = resolveDrawPath(overlay);
  if (coordinates.length < 2) return;

  const bounds = new LngLatBounds();
  for (const coordinate of coordinates) bounds.extend(coordinate);
  for (const stop of remainingStops(overlay)) {
    if (Number.isFinite(stop.longitude) && Number.isFinite(stop.latitude)) {
      bounds.extend([stop.longitude, stop.latitude]);
    }
  }
  if (bounds.isEmpty()) return;
  map.fitBounds(bounds, {
    padding: { top: 48, bottom: 72, left: 48, right: 48 },
    maxZoom: 14,
    duration: 600,
  });
}
