/**
 * Encode and parse shareable dashboard view URLs: map camera, active layers,
 * optional radius filter, and map-focus layout mode.
 */
import {
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
  type GeoFilter,
} from "@/lib/geo-filter";
import { LAYER_BY_KEY, LAYERS, type SensorKey } from "@/lib/layers";

export type MapCameraView = {
  readonly lat: number;
  readonly lng: number;
  readonly zoom: number;
};

export const DEFAULT_MAP_CAMERA: MapCameraView = {
  lat: 1.3521,
  lng: 103.8198,
  zoom: 10.8,
};

export type SharedViewState = {
  readonly camera?: MapCameraView | null;
  readonly sensorVisibility?: Readonly<Record<SensorKey, boolean>>;
  readonly geoFilter?: GeoFilter | null;
  readonly mapFocus?: boolean;
};

export type ParsedViewLink = {
  readonly camera?: MapCameraView;
  readonly sensorVisibility?: Record<SensorKey, boolean>;
  readonly geoFilter?: GeoFilter;
  readonly mapFocus?: boolean;
};

const MIN_ZOOM = 0;
const MAX_ZOOM = 22;

function roundTo(value: number, decimals: number): string {
  const factor = 10 ** decimals;
  return String(Math.round(value * factor) / factor);
}

function parseFiniteNumber(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function buildViewLinkUrl(
  baseUrl: string,
  state: SharedViewState,
): string {
  const params = new URLSearchParams();

  if (
    state.camera &&
    Number.isFinite(state.camera.lat) &&
    Number.isFinite(state.camera.lng) &&
    Number.isFinite(state.camera.zoom) &&
    isValidLatLng(state.camera.lat, state.camera.lng)
  ) {
    params.set("lat", roundTo(state.camera.lat, 5));
    params.set("lng", roundTo(state.camera.lng, 5));
    params.set(
      "z",
      roundTo(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.camera.zoom)), 2),
    );
  }

  if (state.sensorVisibility) {
    const active = LAYERS.filter(
      (layer) => state.sensorVisibility?.[layer.key] === true,
    ).map((layer) => layer.key);
    params.set("layers", active.length > 0 ? active.join(",") : "none");
  }

  if (
    state.geoFilter &&
    Number.isFinite(state.geoFilter.center[0]) &&
    Number.isFinite(state.geoFilter.center[1]) &&
    Number.isFinite(state.geoFilter.radiusM) &&
    isValidLatLng(state.geoFilter.center[1], state.geoFilter.center[0])
  ) {
    const clampedRadius = Math.round(
      Math.min(
        GEO_FILTER_MAX_RADIUS_M,
        Math.max(GEO_FILTER_MIN_RADIUS_M, state.geoFilter.radiusM),
      ),
    );
    params.set(
      "r",
      `${roundTo(state.geoFilter.center[1], 5)},${roundTo(state.geoFilter.center[0], 5)},${clampedRadius}`,
    );
  }

  if (state.mapFocus) {
    params.set("focus", "1");
  }

  const query = params.toString();
  const cleanBase = baseUrl.split(/[?#]/)[0] ?? baseUrl;
  return query ? `${cleanBase}?${query}` : cleanBase;
}

export function parseViewLinkParams(
  input: string | URLSearchParams,
): ParsedViewLink {
  const params =
    typeof input === "string"
      ? new URLSearchParams(input.startsWith("?") ? input.slice(1) : input)
      : input;

  const result: {
    camera?: MapCameraView;
    sensorVisibility?: Record<SensorKey, boolean>;
    geoFilter?: GeoFilter;
    mapFocus?: boolean;
  } = {};

  const lat = parseFiniteNumber(params.get("lat"));
  const lng = parseFiniteNumber(params.get("lng"));
  const zoom = parseFiniteNumber(params.get("z"));
  if (
    lat !== undefined &&
    lng !== undefined &&
    zoom !== undefined &&
    isValidLatLng(lat, lng)
  ) {
    result.camera = {
      lat,
      lng,
      zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)),
    };
  }

  const rawLayers = params.get("layers");
  if (rawLayers !== null) {
    const trimmed = rawLayers.trim();
    if (trimmed === "none") {
      result.sensorVisibility = Object.fromEntries(
        LAYERS.map((layer) => [layer.key, false]),
      ) as Record<SensorKey, boolean>;
    } else if (trimmed.length > 0) {
      const requested = new Set<SensorKey>();
      for (const token of trimmed.split(",")) {
        const key = token.trim() as SensorKey;
        if (LAYER_BY_KEY.has(key)) {
          requested.add(key);
        }
      }
      if (requested.size > 0) {
        result.sensorVisibility = Object.fromEntries(
          LAYERS.map((layer) => [layer.key, requested.has(layer.key)]),
        ) as Record<SensorKey, boolean>;
      }
    }
  }

  const rawRadius = params.get("r");
  if (rawRadius) {
    const parts = rawRadius.split(",");
    if (parts.length === 3) {
      const rLat = parseFiniteNumber(parts[0]);
      const rLng = parseFiniteNumber(parts[1]);
      const rMeters = parseFiniteNumber(parts[2]);
      if (
        rLat !== undefined &&
        rLng !== undefined &&
        rMeters !== undefined &&
        isValidLatLng(rLat, rLng)
      ) {
        result.geoFilter = {
          center: [rLng, rLat],
          radiusM: Math.min(
            GEO_FILTER_MAX_RADIUS_M,
            Math.max(GEO_FILTER_MIN_RADIUS_M, rMeters),
          ),
        };
      }
    }
  }

  const rawFocus = params.get("focus");
  if (rawFocus === "1" || rawFocus === "true") {
    result.mapFocus = true;
  }

  return result;
}
