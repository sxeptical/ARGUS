/**
 * URL serializer and parser for shareable dashboard view links: encodes
 * camera lat/lng/zoom, active map layers, radius filter, and map focus mode.
 */
import { GEO_FILTER_DEFAULT_RADIUS_M, type GeoFilter } from "@/lib/geo-filter";
import { LAYER_BY_KEY, LAYERS, type SensorKey } from "@/lib/layers";
import { parseGeoFilterCenter, parseGeoFilterRadius } from "@/lib/ui-preferences";

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
  camera?: MapCameraView;
  sensorVisibility?: Record<SensorKey, boolean>;
  geoFilter?: GeoFilter;
  mapFocus?: boolean;
};

function parseFinite(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

export function buildViewLinkUrl(
  baseUrl: string,
  state: {
    camera: MapCameraView;
    sensorVisibility: Readonly<Record<SensorKey, boolean>>;
    geoFilter: GeoFilter | null;
    mapFocus: boolean;
  },
): string {
  const url = new URL(baseUrl);
  url.search = "";
  url.searchParams.set("lat", state.camera.lat.toFixed(5));
  url.searchParams.set("lng", state.camera.lng.toFixed(5));
  url.searchParams.set("z", state.camera.zoom.toFixed(2));

  const enabledLayers = LAYERS.filter(
    (layer) => state.sensorVisibility[layer.key],
  ).map((layer) => layer.key);
  url.searchParams.set(
    "layers",
    enabledLayers.length > 0 ? enabledLayers.join(",") : "none",
  );

  if (state.geoFilter) {
    url.searchParams.set(
      "rc",
      `${state.geoFilter.center[0].toFixed(5)},${state.geoFilter.center[1].toFixed(5)}`,
    );
    url.searchParams.set("r", String(Math.round(state.geoFilter.radiusM)));
  }

  if (state.mapFocus) {
    url.searchParams.set("focus", "1");
  }

  return url.toString();
}

export function parseViewLinkParams(
  search: string | URLSearchParams,
): SharedViewState {
  const params =
    typeof search === "string" ? new URLSearchParams(search) : search;
  const result: SharedViewState = {};

  const lat = parseFinite(params.get("lat"));
  const lng = parseFinite(params.get("lng"));
  const zoom = parseFinite(params.get("z"));
  if (
    lat !== null &&
    lng !== null &&
    zoom !== null &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    zoom >= 0 &&
    zoom <= 22
  ) {
    result.camera = { lat, lng, zoom };
  }

  if (params.has("layers")) {
    const visibility = Object.fromEntries(
      LAYERS.map((layer) => [layer.key, false]),
    ) as Record<SensorKey, boolean>;
    const tokens = (params.get("layers") ?? "")
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);
    for (const token of tokens) {
      if (token === "none") continue;
      if (LAYER_BY_KEY.has(token as SensorKey)) {
        visibility[token as SensorKey] = true;
      }
    }
    result.sensorVisibility = visibility;
  }

  if (params.has("rc")) {
    const parts = (params.get("rc") ?? "").split(",");
    if (parts.length === 2) {
      const centerLng = parseFinite(parts[0]);
      const centerLat = parseFinite(parts[1]);
      if (centerLng !== null && centerLat !== null) {
        const validCenter = parseGeoFilterCenter([centerLng, centerLat]);
        if (validCenter) {
          const parsedRadius = parseFinite(params.get("r"));
          const radiusM =
            parsedRadius !== null
              ? (parseGeoFilterRadius(parsedRadius) ??
                GEO_FILTER_DEFAULT_RADIUS_M)
              : GEO_FILTER_DEFAULT_RADIUS_M;
          result.geoFilter = { center: validCenter, radiusM };
        }
      }
    }
  }

  const focusRaw = params.get("focus");
  if (focusRaw === "1" || focusRaw === "true") {
    result.mapFocus = true;
  }

  return result;
}
