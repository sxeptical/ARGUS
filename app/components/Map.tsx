import { useEffect, useRef, useState } from "react";
// MapLibre v6 is ESM-only and requires a namespace import.
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// Serve the worker directly because bundlers can miss its shared chunk.
// scripts/copy-maplibre-worker.mjs copies it here via predev/prebuild.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import type { MrtRouteSegment } from "@/lib/mrt-routing";
import { MRT_DISPLAY_LINE_STATIONS } from "@/lib/mrt-network";
import {
  buildBusRouteGeoJson,
  buildBusRouteStopsGeoJson,
  buildRouteGeoJson,
  resolveBusRouteDrawPath,
  resolveRemainingRouteStops,
  EMPTY_BUS_ROUTE_GEOJSON,
  EMPTY_BUS_ROUTE_STOPS_GEOJSON,
  type BusRouteOverlay,
  type MRTStationGeoJson,
} from "@/lib/map-geometry";
import {
  buildGeoFilterCircleGeoJson,
  buildGeoFilterMaskGeoJson,
  featuresTouchingRadius,
  type GeoFilter,
} from "@/lib/geo-filter";
import mrtLinesData from "@/public/mrt-lines.json";
import {
  buildBusStopGeoJson,
  buildCameraGeoJson,
  buildFlightGeoJson,
  MRT_STATION_GEOJSON,
} from "@/lib/map-features";
import {
  carparkTone,
  evChargerTone,
  describeCarpark,
  describeEvCharger,
  type PopupLine,
} from "@/lib/mobility";
import { describeHawkerCentre, describeMall } from "@/lib/amenities";
import { HAWKER_CENTRES, MALLS } from "@/lib/amenities-data";
import { PARK_LABELS_GEOJSON, PARKS_GEOJSON } from "@/lib/parks-data";
import { describeParkFeature, PARK_KIND_TITLE } from "@/lib/parks";
import type {
  AirRegionKey,
  BusStop,
  CarparkAvailability,
  EvChargingLocation,
  FlightState,
  MRTGeoJson,
  AirQualityOverlay,
  TrafficCamera,
  TrafficIncident,
  ParkFeatureKind,
} from "@/types";

export type { BusRouteOverlay };

export type MapSearchTarget = {
  lat: number;
  lng: number;
  zoom: number;
};

type MapProps = {
  busStops: BusStop[];
  /**
   * Every known bus stop, used to resolve clicks on bus-route stops that may
   * sit outside the radius filter. Defaults to `busStops`.
   */
  allBusStops?: BusStop[];
  cameras: TrafficCamera[];
  flights: FlightState[];
  incidents: TrafficIncident[];
  carparks: CarparkAvailability[];
  evChargers: EvChargingLocation[];
  airQualityOverlay?: AirQualityOverlay | null;
  /** Display names of MRT lines currently flagged as disrupted by LTA. */
  disruptedMrtLines?: ReadonlyArray<string>;
  sensorVisibility: {
    busStops: boolean;
    cameras: boolean;
    flights: boolean;
    mrt: boolean;
    parks: boolean;
    incidents: boolean;
    carparks: boolean;
    evChargers: boolean;
    malls: boolean;
    hawkers: boolean;
  };
  searchTarget?: MapSearchTarget | null;
  onStopClick: (stop: BusStop) => void;
  onCameraClick: (camera: TrafficCamera) => void;
  onFlightClick: (flight: FlightState) => void;
  onMrtStationClick?: (stationName: string) => void;
  onParkClick: (feature: { kind: ParkFeatureKind; name: string; park?: string; type?: string; cycle?: boolean }) => void;
  /** Locks the clicked mall/hawker centre into the Target Focus panel. */
  onAmenityClick?: (target: { type: "mall" | "hawker"; id: string }) => void;
  mrtRouteSegments?: MrtRouteSegment[];
  busRouteOverlay?: BusRouteOverlay | null;
  /** Active radius filter, drawn as a circle; scopes MRT stations and parks. */
  geoFilter?: GeoFilter | null;
  /** While true, the next map click sets the radius filter centre. */
  geoFilterPicking?: boolean;
  onGeoFilterPick?: (center: [number, number]) => void;
};

// Mirror the CSS design tokens in MapLibre-compatible colors.
const MAP_COLORS = {
  paper: "#0a0a0a",
  ink: "#f2f2f2",
  muted: "#8f8f8f",
  success: "#67d391",
  danger: "#ef7373",
  warning: "#e3b341",
  info: "#73b9d9",
  bus: "#54ffae",
  park: "#73d99a",
  parkConnector: "#8ff0b0",
  trail: "#d2f5de",
  carpark: "#8a9cf5",
  ev: "#4fd6e6",
  mall: "#e879c6",
  hawker: "#f0b060",
  geoFilter: "#73b9d9",
} as const;

// Malls and hawker centres are a static bundle: build their sources once.
const MALLS_BY_ID = new globalThis.Map(MALLS.map((mall) => [mall.id, mall]));
const HAWKERS_BY_ID = new globalThis.Map(HAWKER_CENTRES.map((hawker) => [hawker.id, hawker]));
const MALLS_GEOJSON = {
  type: "FeatureCollection" as const,
  features: MALLS.map((mall) => ({
    type: "Feature" as const,
    properties: { id: mall.id, name: mall.name },
    geometry: { type: "Point" as const, coordinates: [mall.lng, mall.lat] },
  })),
};
const HAWKERS_GEOJSON = {
  type: "FeatureCollection" as const,
  features: HAWKER_CENTRES.map((hawker) => ({
    type: "Feature" as const,
    properties: { id: hawker.id, name: hawker.name, status: hawker.status },
    geometry: { type: "Point" as const, coordinates: [hawker.lng, hawker.lat] },
  })),
};

// Carpark/EV points keep their layer colour while available, so the two
// layers stay distinguishable; only low/full/unknown points change colour.
const availabilityColorExpr = (
  layerColor: string,
): maplibregl.ExpressionSpecification => [
  "match",
  ["get", "tone"],
  "success",
  layerColor,
  "warning",
  MAP_COLORS.warning,
  "danger",
  MAP_COLORS.danger,
  MAP_COLORS.muted,
];

/** Increase basemap contrast without changing overlay colors. */
function improveDarkBasemapContrast(map: maplibregl.Map): void {
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id.toLowerCase();
    try {
      switch (layer.type) {
        case "background":
          map.setPaintProperty(layer.id, "background-color", "#101316");
          break;
        case "fill": {
          const color = id.includes("water")
            ? "#102b3d"
            : id.includes("park") ||
                id.includes("wood") ||
                id.includes("landcover")
              ? "#19291f"
              : id.includes("building")
                ? "#292d31"
                : "#1b1f22";
          map.setPaintProperty(layer.id, "fill-color", color);
          map.setPaintProperty(layer.id, "fill-outline-color", "#30363b");
          break;
        }
        case "line": {
          const color =
            id.includes("road") || id.includes("highway")
              ? "#596169"
              : id.includes("water")
                ? "#24506a"
                : id.includes("boundary")
                  ? "#4b5563"
                  : "#41484f";
          map.setPaintProperty(layer.id, "line-color", color);
          break;
        }
        case "symbol":
          map.setPaintProperty(layer.id, "text-color", "#aeb6bf");
          map.setPaintProperty(layer.id, "text-halo-color", "#101316");
          map.setPaintProperty(layer.id, "text-halo-width", 1);
          break;
        case "raster":
          map.setPaintProperty(layer.id, "raster-saturation", -0.7);
          map.setPaintProperty(layer.id, "raster-brightness-max", 0.55);
          break;
      }
    } catch {
      // Some third-party layers use expressions that cannot be replaced by
      // every paint property. Keep the provider default for those layers.
    }
  }
}

const MRT_LINES = mrtLinesData as MRTGeoJson;
const EMPTY_MRT_ROUTE_SEGMENTS: MrtRouteSegment[] = [];
const EMPTY_DISRUPTED_MRT_LINES: ReadonlyArray<string> = [];

const AIR_REGION_CENTERS: ReadonlyArray<{
  key: AirRegionKey;
  label: string;
  lng: number;
  lat: number;
}> = [
  { key: "north", label: "NORTH", lng: 103.82, lat: 1.41803 },
  { key: "south", label: "SOUTH", lng: 103.82, lat: 1.29587 },
  { key: "east", label: "EAST", lng: 103.94, lat: 1.35735 },
  { key: "west", label: "WEST", lng: 103.7, lat: 1.35735 },
  { key: "central", label: "CENTRAL", lng: 103.82, lat: 1.35735 },
];

function buildAirQualityGeoJson(
  overlay: AirQualityOverlay | null | undefined,
) {
  if (!overlay) {
    return { type: "FeatureCollection" as const, features: [] };
  }
  return {
    type: "FeatureCollection" as const,
    features: AIR_REGION_CENTERS.flatMap(({ key, label, lng, lat }) => {
      const { value, tone } = overlay[key];
      if (value === null || !Number.isFinite(value)) return [];
      return [
        {
          type: "Feature" as const,
          properties: {
            region: key,
            value,
            tone,
            label: `${label}\n${value}`,
          },
          geometry: {
            type: "Point" as const,
            coordinates: [lng, lat],
          },
        },
      ];
    }),
  };
}

function fitMapToBusRoute(
  map: maplibregl.Map,
  overlay: BusRouteOverlay | null | undefined,
) {
  if (!overlay) return;
  const drawCoords = resolveBusRouteDrawPath(overlay);
  if (drawCoords.length < 2) return;
  const bounds = new maplibregl.LngLatBounds();
  for (const [lng, lat] of drawCoords) {
    bounds.extend([lng, lat]);
  }
  // Include remaining stop points so termini stay in frame even if the path
  // slightly undershoots stop coordinates.
  for (const stop of resolveRemainingRouteStops(overlay)) {
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

function buildPlaneIcon(size = 64): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    return new ImageData(size, size);
  }

  context.clearRect(0, 0, size, size);
  context.translate(size / 2, size / 2);
  context.fillStyle = MAP_COLORS.ink;

  context.beginPath();
  context.moveTo(0, -size * 0.34); // nose
  context.lineTo(size * 0.08, -size * 0.1);
  context.lineTo(size * 0.3, -size * 0.02); // right wing tip
  context.lineTo(size * 0.12, size * 0.02);
  context.lineTo(size * 0.12, size * 0.3); // tail fin
  context.lineTo(0, size * 0.24);
  context.lineTo(-size * 0.12, size * 0.3);
  context.lineTo(-size * 0.12, size * 0.02);
  context.lineTo(-size * 0.3, -size * 0.02); // left wing tip
  context.lineTo(-size * 0.08, -size * 0.1);
  context.closePath();
  context.fill();

  return context.getImageData(0, 0, size, size);
}

function registerMapLoadListener(
  map: maplibregl.Map,
  listener: () => void,
): () => void {
  map.on("load", listener);
  return () => map.off("load", listener);
}

function registerLayerMouseListener(
  map: maplibregl.Map,
  eventName: "click" | "mouseenter" | "mouseleave",
  layerId: string,
  listener: (event: maplibregl.MapLayerMouseEvent) => void,
): () => void {
  map.on(eventName, layerId, listener);
  return () => map.off(eventName, layerId, listener);
}

function applyMrtRouteFocus(map: maplibregl.Map, hasRoute: boolean) {
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

/** Fade the general bus stops so the active route's stops stand out. */
function applyBusRouteFocus(map: maplibregl.Map, hasRoute: boolean) {
  if (!map.getLayer("bus-stops-layer")) return;
  map.setPaintProperty(
    "bus-stops-layer",
    "circle-opacity",
    hasRoute ? 0.18 : 0.88,
  );
  map.setPaintProperty(
    "bus-stops-layer",
    "circle-stroke-opacity",
    hasRoute ? 0.18 : 1,
  );
}

function buildGeoFilterCenterGeoJson(filter: GeoFilter | null) {
  return {
    type: "FeatureCollection" as const,
    features: filter
      ? [
          {
            type: "Feature" as const,
            properties: {},
            geometry: {
              type: "Point" as const,
              coordinates: [filter.center[0], filter.center[1]],
            },
          },
        ]
      : [],
  };
}

function filterMrtStations(
  stations: MRTStationGeoJson,
  filter: GeoFilter | null,
): MRTStationGeoJson {
  return {
    type: "FeatureCollection",
    features: featuresTouchingRadius(stations.features, filter),
  };
}

/** Static point layers (park labels, malls, hawker centres) inside the radius. */
function filterPointFeatures<C extends { features: Array<{ geometry: { type: "Point"; coordinates: number[] } }> }>(
  collection: C,
  filter: GeoFilter | null,
): C {
  return filter ? { ...collection, features: featuresTouchingRadius(collection.features, filter) } : collection;
}

function filterParks(filter: GeoFilter | null) {
  return filter
    ? {
        ...PARKS_GEOJSON,
        features: featuresTouchingRadius(PARKS_GEOJSON.features, filter),
      }
    : PARKS_GEOJSON;
}

function useLazyRef<T>(createValue: () => T): { current: T } {
  const ref = useRef<T | null>(null);
  if (ref.current === null) {
    ref.current = createValue();
  }
  return ref as { current: T };
}

function createBusStopMap() {
  return new globalThis.Map<string, BusStop>();
}

function createFlightMap() {
  return new globalThis.Map<string, FlightState>();
}

function createCameraMap() {
  return new globalThis.Map<string, TrafficCamera>();
}
function createIncidentMap() {
  return new globalThis.Map<string, TrafficIncident>();
}
function buildCarparksGeoJson(carparks: Iterable<CarparkAvailability>, visible: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: (visible ? [...carparks] : []).map((carpark) => ({
      type: "Feature" as const,
      properties: { id: carpark.id, tone: carparkTone(carpark) },
      geometry: { type: "Point" as const, coordinates: [carpark.lng, carpark.lat] },
    })),
  };
}
function buildEvChargersGeoJson(locations: Iterable<EvChargingLocation>, visible: boolean) {
  return {
    type: "FeatureCollection" as const,
    features: (visible ? [...locations] : []).map((location) => ({
      type: "Feature" as const,
      properties: { id: location.id, tone: evChargerTone(location) },
      geometry: { type: "Point" as const, coordinates: [location.lng, location.lat] },
    })),
  };
}
function createCarparkMap() {
  return new globalThis.Map<string, CarparkAvailability>();
}
function createEvChargerMap() {
  return new globalThis.Map<string, EvChargingLocation>();
}

function useMapController({
  busStops,
  allBusStops,
  cameras,
  flights,
  incidents,
  carparks,
  evChargers,
  airQualityOverlay = null,
  disruptedMrtLines = EMPTY_DISRUPTED_MRT_LINES,
  sensorVisibility,
  onStopClick,
  onCameraClick,
  onFlightClick,
  onMrtStationClick,
  onParkClick,
  onAmenityClick,
  mrtRouteSegments = EMPTY_MRT_ROUTE_SEGMENTS,
  busRouteOverlay = null,
  searchTarget = null,
  geoFilter = null,
  geoFilterPicking = false,
  onGeoFilterPick,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const busStopsRef = useLazyRef(createBusStopMap);
  const busStopLookupRef = useLazyRef(createBusStopMap);
  const camerasRef = useLazyRef(createCameraMap);
  const flightsRef = useLazyRef(createFlightMap);
  const incidentsRef = useLazyRef(createIncidentMap);
  const carparksRef = useLazyRef(createCarparkMap);
  const evChargersRef = useLazyRef(createEvChargerMap);
  const onStopClickRef = useRef(onStopClick);
  const onCameraClickRef = useRef(onCameraClick);
  const onFlightClickRef = useRef(onFlightClick);
  const onMrtStationClickRef = useRef(onMrtStationClick);
  const onParkClickRef = useRef(onParkClick);
  const onAmenityClickRef = useRef(onAmenityClick);
  const hoverPopupRef = useRef<maplibregl.Popup | null>(null);
  const mrtLinesRef = useRef<MRTGeoJson | null>(null);
  const mrtRouteSegmentsRef = useRef<MrtRouteSegment[]>(mrtRouteSegments);
  const busRouteOverlayRef = useRef<BusRouteOverlay | null>(busRouteOverlay);
  const airQualityOverlayRef = useRef<AirQualityOverlay | null>(airQualityOverlay);
  const sensorVisibilityRef = useRef(sensorVisibility);
  const geoFilterRef = useRef<GeoFilter | null>(geoFilter);
  const geoFilterPickingRef = useRef(geoFilterPicking);
  const onGeoFilterPickRef = useRef(onGeoFilterPick);
  const lastFittedBusRouteKeyRef = useRef<string | null>(null);
  const [mapInitError, setMapInitError] = useState<string | null>(null);

  useEffect(() => {
    onStopClickRef.current = onStopClick;
  }, [onStopClick]);

  useEffect(() => {
    onCameraClickRef.current = onCameraClick;
  }, [onCameraClick]);

  useEffect(() => {
    onFlightClickRef.current = onFlightClick;
  }, [onFlightClick]);

  useEffect(() => {
    onMrtStationClickRef.current = onMrtStationClick;
  }, [onMrtStationClick]);
  useEffect(() => { onParkClickRef.current = onParkClick; }, [onParkClick]);
  useEffect(() => { onAmenityClickRef.current = onAmenityClick; }, [onAmenityClick]);

  useEffect(() => {
    sensorVisibilityRef.current = sensorVisibility;
  }, [sensorVisibility]);

  useEffect(() => {
    onGeoFilterPickRef.current = onGeoFilterPick;
  }, [onGeoFilterPick]);

  useEffect(() => {
    geoFilterPickingRef.current = geoFilterPicking;
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = geoFilterPicking ? "crosshair" : "";
  }, [geoFilterPicking]);

  // Live feeds arrive pre-filtered via props; the static MRT station, park,
  // mall and hawker sources are filtered here, and the circle is redrawn.
  useEffect(() => {
    geoFilterRef.current = geoFilter;
    const map = mapRef.current;
    if (!map) return;
    (map.getSource("geo-filter") as maplibregl.GeoJSONSource | undefined)
      ?.setData(buildGeoFilterCircleGeoJson(geoFilter));
    (map.getSource("geo-filter-mask") as maplibregl.GeoJSONSource | undefined)
      ?.setData(buildGeoFilterMaskGeoJson(geoFilter));
    (map.getSource("geo-filter-center") as maplibregl.GeoJSONSource | undefined)
      ?.setData(buildGeoFilterCenterGeoJson(geoFilter));
    (map.getSource("mrt-stations") as maplibregl.GeoJSONSource | undefined)
      ?.setData(filterMrtStations(MRT_STATION_GEOJSON, geoFilter));
    (map.getSource("parks-data") as maplibregl.GeoJSONSource | undefined)
      ?.setData(filterParks(geoFilter));
    (map.getSource("park-labels") as maplibregl.GeoJSONSource | undefined)
      ?.setData(filterPointFeatures(PARK_LABELS_GEOJSON, geoFilter));
    (map.getSource("malls-data") as maplibregl.GeoJSONSource | undefined)
      ?.setData(filterPointFeatures(MALLS_GEOJSON, geoFilter));
    (map.getSource("hawkers-data") as maplibregl.GeoJSONSource | undefined)
      ?.setData(filterPointFeatures(HAWKERS_GEOJSON, geoFilter));
  }, [geoFilter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setLayerVisibility = (layerId: string, visible: boolean) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(
        layerId,
        "visibility",
        visible ? "visible" : "none",
      );
    };

    setLayerVisibility("bus-stops-layer", sensorVisibility.busStops);
    setLayerVisibility("cameras-clusters-layer", sensorVisibility.cameras);
    setLayerVisibility("cameras-count-layer", sensorVisibility.cameras);
    setLayerVisibility("cameras-point-layer", sensorVisibility.cameras);
    setLayerVisibility("flights-layer", sensorVisibility.flights);
    setLayerVisibility("flights-label-layer", sensorVisibility.flights);
    setLayerVisibility("mrt-lines-casing-layer", sensorVisibility.mrt);
    setLayerVisibility("mrt-lines-layer", sensorVisibility.mrt);
    setLayerVisibility("mrt-lines-future-casing-layer", sensorVisibility.mrt);
    setLayerVisibility("mrt-lines-future-layer", sensorVisibility.mrt);
    setLayerVisibility("mrt-route-casing-layer", sensorVisibility.mrt);
    setLayerVisibility("mrt-route-layer", sensorVisibility.mrt);
    setLayerVisibility("mrt-stations-layer", sensorVisibility.mrt);
    setLayerVisibility("mrt-stations-label-layer", sensorVisibility.mrt);
    setLayerVisibility("parks-fill-layer", sensorVisibility.parks);
    setLayerVisibility("parks-outline-layer", sensorVisibility.parks);
    setLayerVisibility("parks-label-layer", sensorVisibility.parks);
    setLayerVisibility("pcn-casing-layer", sensorVisibility.parks);
    setLayerVisibility("pcn-lines-layer", sensorVisibility.parks);
    setLayerVisibility("trails-lines-layer", sensorVisibility.parks);
    setLayerVisibility("incidents-point-layer", sensorVisibility.incidents);
    setLayerVisibility("carparks-point-layer", sensorVisibility.carparks);
    setLayerVisibility("ev-chargers-point-layer", sensorVisibility.evChargers);
    setLayerVisibility("malls-point-layer", sensorVisibility.malls);
    setLayerVisibility("malls-label-layer", sensorVisibility.malls);
    setLayerVisibility("hawkers-point-layer", sensorVisibility.hawkers);
    setLayerVisibility("hawkers-label-layer", sensorVisibility.hawkers);
  }, [sensorVisibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !searchTarget) return;
    map.flyTo({
      center: [searchTarget.lng, searchTarget.lat],
      zoom: searchTarget.zoom,
      duration: 1000,
      essential: true,
    });
  }, [searchTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    mrtRouteSegmentsRef.current = mrtRouteSegments;
    if (!mrtLinesRef.current) return;
    const routeGeoJson = buildRouteGeoJson(
      mrtLinesRef.current,
      mrtRouteSegmentsRef.current,
      MRT_DISPLAY_LINE_STATIONS,
    );
    const routeSource = map.getSource("mrt-route") as
      maplibregl.GeoJSONSource | undefined;
    if (routeSource) {
      routeSource.setData(routeGeoJson);
    }
    applyMrtRouteFocus(map, routeGeoJson.features.length > 0);
  }, [mrtRouteSegments]);

  useEffect(() => {
    const map = mapRef.current;
    busRouteOverlayRef.current = busRouteOverlay;
    if (!map) return;

    const geoJson = buildBusRouteGeoJson(busRouteOverlay);
    const source = map.getSource("bus-route") as
      maplibregl.GeoJSONSource | undefined;
    if (source) {
      source.setData(geoJson);
    }

    const stopsGeoJson = buildBusRouteStopsGeoJson(busRouteOverlay);
    const stopsSource = map.getSource("bus-route-stops") as
      maplibregl.GeoJSONSource | undefined;
    if (stopsSource) {
      stopsSource.setData(stopsGeoJson);
    }
    applyBusRouteFocus(map, geoJson.features.length > 0);

    const overlayKey = busRouteOverlay
      ? `${busRouteOverlay.serviceNo}:${busRouteOverlay.direction}:${busRouteOverlay.selectedPathIndex ?? busRouteOverlay.selectedStopIndex ?? "x"}:${busRouteOverlay.path.length}`
      : null;

    if (overlayKey && overlayKey !== lastFittedBusRouteKeyRef.current) {
      fitMapToBusRoute(map, busRouteOverlay);
      lastFittedBusRouteKeyRef.current = overlayKey;
    }
    if (!overlayKey) {
      lastFittedBusRouteKeyRef.current = null;
    }
  }, [busRouteOverlay]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    // Keep data panels usable if map construction fails (for example, no WebGL2).
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: "https://tiles.openfreemap.org/styles/dark",
        center: [103.8198, 1.3521],
        zoom: 10.8,
      });

      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.addControl(
        new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true },
          trackUserLocation: true,
          showUserHeading: true,
        } as unknown as maplibregl.GeolocateControlOptions),
        "top-right",
      );
    } catch (error) {
      console.error(
        "Map unavailable; dashboard continues without the map layer",
        error,
      );
      // The map constructor is an external system: report its failure through
      // a callback so the state update is not a synchronous effect write.
      queueMicrotask(() =>
        setMapInitError(
          error instanceof Error && error.message
            ? error.message
            : "Map could not be initialized",
        ),
      );
      return;
    }

    const layerListenerCleanups: Array<() => void> = [];
    // While picking a radius centre, the click belongs to the picker, not to
    // whatever feature happens to be under the cursor.
    const handleMapClick = (event: maplibregl.MapMouseEvent) => {
      if (!geoFilterPickingRef.current) return;
      onGeoFilterPickRef.current?.([event.lngLat.lng, event.lngLat.lat]);
    };
    const handleBusStopClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (geoFilterPickingRef.current) return;
      const feature = event.features?.[0];
      const code = feature?.properties?.BusStopCode;
      if (typeof code !== "string") return;
      const stop = busStopLookupRef.current.get(code);
      if (stop) onStopClickRef.current(stop);
    };
    const handleFlightClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (geoFilterPickingRef.current) return;
      const feature = event.features?.[0];
      const id = feature?.properties?.id;
      if (typeof id !== "string") return;
      const flight = flightsRef.current.get(id);
      if (flight) onFlightClickRef.current(flight);
    };
    const showHoverPopup = (lngLat: maplibregl.LngLatLike, title: string, titleClass: string, lines: ReadonlyArray<string | PopupLine>, photos: ReadonlyArray<{ src: string; alt: string }> = []) => {
      const content = document.createElement("div");
      const heading = document.createElement("div");
      heading.className = `argus-hover-popup-type ${titleClass}`;
      heading.textContent = title;
      content.append(heading);
      if (photos.length) {
        // One compact row (the map panel is short); fixed boxes so the popup
        // doesn't jump while thumbnails load.
        const strip = document.createElement("div");
        strip.className = `argus-hover-popup-photos argus-hover-popup-photos-${Math.min(photos.length, 3)}`;
        for (const photo of photos.slice(0, 3)) {
          const image = document.createElement("img");
          image.src = photo.src;
          image.alt = photo.alt;
          image.decoding = "async";
          image.referrerPolicy = "no-referrer";
          image.onerror = () => image.remove();
          strip.append(image);
        }
        content.append(strip);
      }
      for (const line of lines) {
        const row = document.createElement("div");
        if (typeof line === "string") {
          row.className = "argus-hover-popup-message";
          row.textContent = line;
        } else {
          row.className = `argus-hover-popup-${line.kind}${line.tone ? ` text-${line.tone}` : ""}`;
          row.textContent = line.text;
        }
        content.append(row);
      }
      hoverPopupRef.current?.remove();
      const open = (anchor?: maplibregl.PositionAnchor) =>
        new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: "argus-hover-popup", maxWidth: "280px", anchor })
          .setLngLat(lngLat)
          .setDOMContent(content)
          .addTo(map);
      let popup = open();
      // MapLibre's auto-anchor only flips above/below. A tall popup (mall
      // photos) can fit neither way in the short map panel, so open it beside
      // the point instead, on whichever side has room.
      const { offsetHeight: height, offsetWidth: width } = popup.getElement();
      const point = map.project(lngLat);
      const { clientHeight, clientWidth } = map.getContainer();
      if (point.y + height > clientHeight && point.y - height < 0) {
        popup.remove();
        popup = open(clientWidth - point.x >= width ? "left" : "right");
      }
      hoverPopupRef.current = popup;
    };
    const handleIncidentEnter = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      const incident = incidentsRef.current.get(id);
      if (!incident) return;
      showHoverPopup(event.lngLat, incident.type.toUpperCase(), incident.type === "Accident" ? "text-danger" : incident.type === "Vehicle Breakdown" || incident.type === "Heavy Traffic" ? "text-warning" : "text-muted", [incident.message]);
    };
    const handleCarparkEnter = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      const carpark = carparksRef.current.get(id);
      if (!carpark) return;
      showHoverPopup(event.lngLat, `${carpark.agency} CARPARK`, "text-signal-carpark", describeCarpark(carpark));
    };
    const handleEvChargerEnter = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      const location = evChargersRef.current.get(id);
      if (!location) return;
      showHoverPopup(event.lngLat, "EV CHARGING", "text-signal-ev", describeEvCharger(location));
    };
    const handleMallEnter = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      const mall = typeof id === "string" ? MALLS_BY_ID.get(id) : undefined;
      if (mall) showHoverPopup(event.lngLat, "MALL", "text-signal-mall", describeMall(mall), mall.photos.map((photo, index) => ({ src: photo.thumb, alt: `${mall.name} photo ${index + 1}` })));
    };
    const handleHawkerEnter = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      const hawker = typeof id === "string" ? HAWKERS_BY_ID.get(id) : undefined;
      if (hawker) showHoverPopup(event.lngLat, "HAWKER CENTRE", "text-signal-hawker", describeHawkerCentre(hawker), hawker.photos.map((photo, index) => ({ src: photo.thumb, alt: `${hawker.name} photo ${index + 1}` })));
    };
    const handleMallClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      onAmenityClickRef.current?.({ type: "mall", id });
    };
    const handleHawkerClick = (event: maplibregl.MapLayerMouseEvent) => {
      const id = event.features?.[0]?.properties?.id;
      if (typeof id !== "string") return;
      onAmenityClickRef.current?.({ type: "hawker", id });
    };
    // Parks overlap their own connectors and trails, so one map-level hover
    // picks the topmost recreation feature rather than racing per-layer
    // enter/leave events. It never replaces another layer's popup.
    const PARK_PATH_LAYERS = ["pcn-lines-layer", "trails-lines-layer"];
    // Paths are a few pixels wide; let the cursor be this close to count.
    const PARK_PATH_HOVER_PX = 5;
    let parkPopup: maplibregl.Popup | null = null;
    let parkHoverKey: string | null = null;
    const clearParkPopup = () => {
      if (!parkPopup) return;
      parkPopup.remove();
      if (hoverPopupRef.current === parkPopup) hoverPopupRef.current = null;
      parkPopup = null;
      parkHoverKey = null;
    };
    const handleParkHover = (event: maplibregl.MapMouseEvent) => {
      if (hoverPopupRef.current && hoverPopupRef.current !== parkPopup) return;
      const visible = sensorVisibilityRef.current.parks;
      const pathLayers = visible ? PARK_PATH_LAYERS.filter((id) => map.getLayer(id)) : [];
      const { x, y } = event.point;
      const near: [maplibregl.PointLike, maplibregl.PointLike] = [[x - PARK_PATH_HOVER_PX, y - PARK_PATH_HOVER_PX], [x + PARK_PATH_HOVER_PX, y + PARK_PATH_HOVER_PX]];
      const properties =
        (pathLayers.length ? map.queryRenderedFeatures(near, { layers: pathLayers })[0]?.properties : undefined) ??
        (visible && map.getLayer("parks-fill-layer") ? map.queryRenderedFeatures(event.point, { layers: ["parks-fill-layer"] })[0]?.properties : undefined);
      const kind = properties?.kind as ParkFeatureKind | undefined;
      if (!properties || !kind || !(kind in PARK_KIND_TITLE) || typeof properties.name !== "string") {
        clearParkPopup();
        return;
      }
      const key = `${kind}:${properties.name}`;
      if (key === parkHoverKey && parkPopup && hoverPopupRef.current === parkPopup) return;
      showHoverPopup(event.lngLat, PARK_KIND_TITLE[kind], "text-signal-park", describeParkFeature({
        kind,
        name: properties.name,
        ...(typeof properties.park === "string" ? { park: properties.park } : {}),
        ...(typeof properties.type === "string" ? { type: properties.type } : {}),
        cycle: properties.cycle === true || properties.cycle === "true",
        ...(typeof properties.areaHa === "number" ? { areaHa: properties.areaHa } : {}),
      }));
      parkPopup = hoverPopupRef.current;
      parkHoverKey = key;
    };
    map.on("mousemove", handleParkHover);
    map.on("mouseout", clearParkPopup);
    layerListenerCleanups.push(() => {
      map.off("mousemove", handleParkHover);
      map.off("mouseout", clearParkPopup);
    });
    const handleHoverPopupLeave = () => {
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
    };
    const handleInteractiveLayerEnter = () => {
      map.getCanvas().style.cursor = geoFilterPickingRef.current
        ? "crosshair"
        : "pointer";
    };
    const handleInteractiveLayerLeave = () => {
      map.getCanvas().style.cursor = geoFilterPickingRef.current
        ? "crosshair"
        : "";
    };
    const handleCameraPointClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (geoFilterPickingRef.current) return;
      const feature = event.features?.[0];
      const cameraId = feature?.properties?.CameraID;
      if (typeof cameraId !== "string") return;
      const camera = camerasRef.current.get(cameraId);
      if (camera) onCameraClickRef.current(camera);
    };
    const handleCameraClusterClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (geoFilterPickingRef.current) return;
      const feature = event.features?.[0];
      const clusterId = feature?.properties?.cluster_id;
      const geometry = feature?.geometry as
        | { type: string; coordinates?: unknown }
        | undefined;
      const coords = geometry?.coordinates;
      if (typeof clusterId !== "number" || !Array.isArray(coords)) return;
      const source = map.getSource("cameras") as
        | maplibregl.GeoJSONSource
        | undefined;
      try {
        const result = (
          source as unknown as {
            getClusterExpansionZoom: (
              id: number,
            ) => Promise<number> | number;
          }
        )?.getClusterExpansionZoom(clusterId);
        const applyZoom = (zoom: number) => {
          if (!Number.isFinite(zoom)) return;
          map.easeTo({
            center: [coords[0] as number, coords[1] as number],
            zoom: Math.min(zoom, 16),
            duration: 400,
          });
        };
        if (result instanceof Promise) {
          result.then(applyZoom).catch(() => undefined);
        } else if (typeof result === "number") {
          applyZoom(result);
        }
      } catch {
        // Cluster zoom is best-effort; ignore failures.
      }
    };
    const handleMrtStationClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (geoFilterPickingRef.current) return;
      const feature = event.features?.[0];
      const stationName = feature?.properties?.name;
      const routeable = feature?.properties?.routeable;
      if (routeable !== true && routeable !== "true") return;
      if (typeof stationName !== "string" || !stationName.trim()) return;
      onMrtStationClickRef.current?.(stationName);
    };
    const handleMrtStationEnter = (event: maplibregl.MapLayerMouseEvent) => {
      const routeable = event.features?.some((feature) => {
        const value = feature.properties?.routeable;
        return value === true || value === "true";
      });
      map.getCanvas().style.cursor = geoFilterPickingRef.current
        ? "crosshair"
        : routeable
          ? "pointer"
          : "";
    };
    const handleParkClick = (event: maplibregl.MapLayerMouseEvent) => {
      if (geoFilterPickingRef.current) return;
      const properties = event.features?.[0]?.properties;
      if (!properties || !["park", "pcn", "trail"].includes(properties.kind)) return;
      if (typeof properties.name !== "string" || !properties.name) return;
      onParkClickRef.current({
        kind: properties.kind as ParkFeatureKind,
        name: properties.name,
        ...(typeof properties.park === "string" ? { park: properties.park } : {}),
        ...(typeof properties.type === "string" ? { type: properties.type } : {}),
        ...(properties.cycle === true || properties.cycle === "true" ? { cycle: true } : {}),
      });
    };

    const handleMapLoad = () => {
      improveDarkBasemapContrast(map);

      // Radius filter circle sits beneath every data overlay.
      map.addSource("geo-filter", {
        type: "geojson",
        data: buildGeoFilterCircleGeoJson(geoFilterRef.current),
      });
      map.addSource("geo-filter-mask", {
        type: "geojson",
        data: buildGeoFilterMaskGeoJson(geoFilterRef.current),
      });
      map.addSource("geo-filter-center", {
        type: "geojson",
        data: buildGeoFilterCenterGeoJson(geoFilterRef.current),
      });
      map.addLayer({
        id: "geo-filter-mask-layer",
        type: "fill",
        source: "geo-filter-mask",
        paint: {
          "fill-color": MAP_COLORS.paper,
          "fill-opacity": 0.45,
        },
      });
      map.addLayer({
        id: "geo-filter-fill-layer",
        type: "fill",
        source: "geo-filter",
        paint: {
          "fill-color": MAP_COLORS.geoFilter,
          "fill-opacity": 0.05,
        },
      });
      map.addLayer({
        id: "geo-filter-line-layer",
        type: "line",
        source: "geo-filter",
        paint: {
          "line-color": MAP_COLORS.geoFilter,
          "line-width": 2,
          "line-opacity": 1,
          "line-dasharray": [3, 2],
        },
      });
      map.addLayer({
        id: "geo-filter-center-layer",
        type: "circle",
        source: "geo-filter-center",
        paint: {
          "circle-radius": 3.5,
          "circle-color": MAP_COLORS.geoFilter,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": MAP_COLORS.paper,
        },
      });

      map.addSource("bus-stops", {
        type: "geojson",
        data: buildBusStopGeoJson(busStopsRef.current.values()),
      });

      map.addLayer({
        id: "bus-stops-layer",
        type: "circle",
        source: "bus-stops",
        layout: {
          visibility: sensorVisibilityRef.current.busStops ? "visible" : "none",
        },
        paint: {
          "circle-radius": 3,
          "circle-color": MAP_COLORS.bus,
          "circle-opacity": 0.88,
          "circle-stroke-width": 1,
          "circle-stroke-color": MAP_COLORS.paper,
        },
      });

      // Bus route overlay: polyline + remaining stops from selected → terminus.
      const initialBusRouteGeoJson = buildBusRouteGeoJson(
        busRouteOverlayRef.current,
      );
      const initialBusRouteStopsGeoJson = buildBusRouteStopsGeoJson(
        busRouteOverlayRef.current,
      );
      map.addSource("bus-route", {
        type: "geojson",
        data: initialBusRouteGeoJson.features.length
          ? initialBusRouteGeoJson
          : EMPTY_BUS_ROUTE_GEOJSON,
      });
      map.addSource("bus-route-stops", {
        type: "geojson",
        data: initialBusRouteStopsGeoJson.features.length
          ? initialBusRouteStopsGeoJson
          : EMPTY_BUS_ROUTE_STOPS_GEOJSON,
      });
      map.addLayer({
        id: "bus-route-casing-layer",
        type: "line",
        source: "bus-route",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": MAP_COLORS.paper,
          "line-width": 7.5,
          "line-opacity": 0.65,
        },
      });
      map.addLayer({
        id: "bus-route-layer",
        type: "line",
        source: "bus-route",
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": MAP_COLORS.bus,
          "line-width": 4.6,
          "line-opacity": 0.95,
        },
      });
      // Route stops sit above the general bus-stops layer so they stay visible
      // when zoomed out along the active service path.
      map.addLayer({
        id: "bus-route-stops-layer",
        type: "circle",
        source: "bus-route-stops",
        paint: {
          "circle-radius": [
            "match",
            ["get", "role"],
            "selected",
            7,
            "terminus",
            6.5,
            5,
          ],
          "circle-color": MAP_COLORS.bus,
          "circle-opacity": 1,
          "circle-stroke-width": [
            "match",
            ["get", "role"],
            "selected",
            2.5,
            "terminus",
            2,
            1.5,
          ],
          "circle-stroke-color": MAP_COLORS.paper,
        },
      });
      map.addLayer({
        id: "bus-route-stops-label-layer",
        type: "symbol",
        source: "bus-route-stops",
        minzoom: 12,
        layout: {
          "text-field": ["get", "Description"],
          "text-size": 10,
          "text-anchor": "top",
          "text-offset": [0, 0.9],
          "text-optional": true,
          "text-max-width": 10,
        },
        paint: {
          "text-color": MAP_COLORS.ink,
          "text-halo-color": MAP_COLORS.paper,
          "text-halo-width": 1.2,
        },
      });
      applyBusRouteFocus(map, initialBusRouteGeoJson.features.length > 0);

      layerListenerCleanups.push(
        registerLayerMouseListener(
          map,
          "click",
          "bus-stops-layer",
          handleBusStopClick,
        ),
        registerLayerMouseListener(
          map,
          "mouseenter",
          "bus-stops-layer",
          handleInteractiveLayerEnter,
        ),
        registerLayerMouseListener(
          map,
          "mouseleave",
          "bus-stops-layer",
          handleInteractiveLayerLeave,
        ),
        // Same click handler: route stop codes resolve via busStopsRef.
        registerLayerMouseListener(
          map,
          "click",
          "bus-route-stops-layer",
          handleBusStopClick,
        ),
        registerLayerMouseListener(
          map,
          "mouseenter",
          "bus-route-stops-layer",
          handleInteractiveLayerEnter,
        ),
        registerLayerMouseListener(
          map,
          "mouseleave",
          "bus-route-stops-layer",
          handleInteractiveLayerLeave,
        ),
      );

      map.addSource("flights", {
        type: "geojson",
        data: buildFlightGeoJson(flightsRef.current.values()),
      });

      if (!map.hasImage("plane-icon")) {
        map.addImage("plane-icon", buildPlaneIcon(), { sdf: true });
      }

      map.addLayer({
        id: "flights-layer",
        type: "symbol",
        source: "flights",
        layout: {
          visibility: sensorVisibilityRef.current.flights ? "visible" : "none",
          "icon-image": "plane-icon",
          "icon-size": 0.32,
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-rotate": ["coalesce", ["get", "track"], 0],
          "icon-rotation-alignment": "map",
        },
        paint: {
          "icon-color": [
            "match",
            ["get", "direction"],
            "inbound",
            MAP_COLORS.success,
            "outbound",
            MAP_COLORS.danger,
            MAP_COLORS.info,
          ],
          "icon-halo-color": MAP_COLORS.paper,
          "icon-halo-width": 1.2,
          "icon-opacity": 0.98,
        },
      });

      map.addLayer({
        id: "flights-label-layer",
        type: "symbol",
        source: "flights",
        minzoom: 10.8,
        layout: {
          visibility: sensorVisibilityRef.current.flights ? "visible" : "none",
          "text-field": ["get", "callsign"],
          "text-size": 10,
          "text-anchor": "left",
          "text-offset": [0.8, 0],
        },
        paint: {
          "text-color": MAP_COLORS.ink,
          "text-halo-color": MAP_COLORS.paper,
          "text-halo-width": 1,
        },
      });

      layerListenerCleanups.push(
        registerLayerMouseListener(
          map,
          "click",
          "flights-layer",
          handleFlightClick,
        ),
        registerLayerMouseListener(
          map,
          "mouseenter",
          "flights-layer",
          handleInteractiveLayerEnter,
        ),
        registerLayerMouseListener(
          map,
          "mouseleave",
          "flights-layer",
          handleInteractiveLayerLeave,
        ),
      );

      // Traffic cameras as a clustered GeoJSON source — scales to hundreds of
      // nodes without one DOM Marker per camera.
      map.addSource("cameras", {
        type: "geojson",
        data: buildCameraGeoJson(camerasRef.current.values()),
        cluster: true,
        clusterMaxZoom: 13,
        clusterRadius: 40,
      });

      map.addLayer({
        id: "cameras-clusters-layer",
        type: "circle",
        source: "cameras",
        filter: ["has", "point_count"],
        layout: {
          visibility: sensorVisibilityRef.current.cameras
            ? "visible"
            : "none",
        },
        paint: {
          "circle-color": MAP_COLORS.muted,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            12,
            10,
            16,
            30,
            20,
          ],
          "circle-opacity": 0.9,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": MAP_COLORS.paper,
        },
      });

      map.addLayer({
        id: "cameras-count-layer",
        type: "symbol",
        source: "cameras",
        filter: ["has", "point_count"],
        layout: {
          visibility: sensorVisibilityRef.current.cameras
            ? "visible"
            : "none",
          "text-field": ["get", "point_count_abbreviated"],
          "text-size": 10,
        },
        paint: {
          "text-color": MAP_COLORS.paper,
        },
      });

      map.addLayer({
        id: "cameras-point-layer",
        type: "circle",
        source: "cameras",
        filter: ["!", ["has", "point_count"]],
        layout: {
          visibility: sensorVisibilityRef.current.cameras
            ? "visible"
            : "none",
        },
        paint: {
          "circle-radius": 5,
          "circle-color": MAP_COLORS.ink,
          "circle-opacity": 0.95,
          "circle-stroke-width": 1.5,
          "circle-stroke-color": MAP_COLORS.paper,
        },
      });

      layerListenerCleanups.push(
        registerLayerMouseListener(
          map,
          "click",
          "cameras-point-layer",
          handleCameraPointClick,
        ),
        registerLayerMouseListener(
          map,
          "click",
          "cameras-clusters-layer",
          handleCameraClusterClick,
        ),
        registerLayerMouseListener(
          map,
          "mouseenter",
          "cameras-point-layer",
          handleInteractiveLayerEnter,
        ),
        registerLayerMouseListener(
          map,
          "mouseleave",
          "cameras-point-layer",
          handleInteractiveLayerLeave,
        ),
        registerLayerMouseListener(
          map,
          "mouseenter",
          "cameras-clusters-layer",
          handleInteractiveLayerEnter,
        ),
        registerLayerMouseListener(
          map,
          "mouseleave",
          "cameras-clusters-layer",
          handleInteractiveLayerLeave,
        ),
      );

      try {
        const geoJson = MRT_LINES;
        mrtLinesRef.current = geoJson;

        map.addSource("mrt-lines", {
          type: "geojson",
          data: geoJson,
        });

        // LRT lines are thinner and sort beneath MRT where they meet. Their
        // colour in mrt-lines.json is a lightened LTA LRT grey (#748477 is
        // near-invisible on the dark basemap).
        const isLrtLine: maplibregl.ExpressionSpecification = ["==", ["get", "mode"], "lrt"];
        map.addLayer({
          id: "mrt-lines-casing-layer",
          type: "line",
          source: "mrt-lines",
          filter: ["!=", "status", "future"],
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
            "line-sort-key": ["case", isLrtLine, 0, 1],
          },
          paint: {
            "line-color": MAP_COLORS.paper,
            "line-width": ["case", isLrtLine, 5.2, 6.8],
            "line-opacity": 0.84,
          },
        });

        map.addLayer({
          id: "mrt-lines-layer",
          type: "line",
          source: "mrt-lines",
          filter: ["!=", "status", "future"],
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
            "line-sort-key": ["case", isLrtLine, 0, 1],
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": ["case", isLrtLine, 3, 4.2],
            "line-opacity": 0.96,
          },
        });

        map.addLayer({
          id: "mrt-lines-future-casing-layer",
          type: "line",
          source: "mrt-lines",
          filter: ["==", "status", "future"],
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
          },
          paint: {
            "line-color": MAP_COLORS.paper,
            "line-width": 6.2,
            "line-opacity": 0.72,
            "line-dasharray": [2, 3],
          },
        });

        map.addLayer({
          id: "mrt-lines-future-layer",
          type: "line",
          source: "mrt-lines",
          filter: ["==", "status", "future"],
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 3.8,
            "line-opacity": 0.82,
            "line-dasharray": [2, 3],
          },
        });

        const initialRouteGeoJson = buildRouteGeoJson(
          geoJson,
          mrtRouteSegmentsRef.current,
          MRT_DISPLAY_LINE_STATIONS,
        );

        map.addSource("mrt-route", {
          type: "geojson",
          data: initialRouteGeoJson,
        });

        map.addLayer({
          id: "mrt-route-casing-layer",
          type: "line",
          source: "mrt-route",
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": MAP_COLORS.ink,
            "line-width": 7.2,
            "line-opacity": 0.45,
          },
        });

        map.addLayer({
          id: "mrt-route-layer",
          type: "line",
          source: "mrt-route",
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
            "line-cap": "round",
            "line-join": "round",
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 4.8,
            "line-opacity": 1,
          },
        });

        applyMrtRouteFocus(map, initialRouteGeoJson.features.length > 0);

        map.addSource("mrt-stations", {
          type: "geojson",
          data: filterMrtStations(MRT_STATION_GEOJSON, geoFilterRef.current),
        });

        // Interchanges keep their MRT colour on top of the LRT dot.
        const isLrtStation: maplibregl.ExpressionSpecification = ["in", "LRT", ["get", "line"]];
        map.addLayer({
          id: "mrt-stations-layer",
          type: "circle",
          source: "mrt-stations",
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
            "circle-sort-key": ["case", isLrtStation, 0, 1],
          },
          paint: {
            "circle-radius": ["case", isLrtStation, 3.5, 4],
            "circle-color": ["get", "color"],
            "circle-opacity": ["case", ["get", "routeable"], 1, 0.35],
            "circle-stroke-width": 1,
            "circle-stroke-color": [
              "case",
              ["get", "routeable"],
              MAP_COLORS.paper,
              MAP_COLORS.muted,
            ],
          },
        });

        map.addLayer({
          id: "mrt-stations-label-layer",
          type: "symbol",
          source: "mrt-stations",
          minzoom: 11.5,
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
            "text-field": ["get", "label"],
            "text-size": 10,
            "text-anchor": "top",
            "text-offset": [0, 1],
          },
          paint: {
            "text-color": MAP_COLORS.ink,
            "text-halo-color": MAP_COLORS.paper,
            "text-halo-width": 1,
          },
        });

        layerListenerCleanups.push(
          registerLayerMouseListener(
            map,
            "click",
            "mrt-stations-layer",
            handleMrtStationClick,
          ),
          registerLayerMouseListener(
            map,
            "mouseenter",
            "mrt-stations-layer",
            handleMrtStationEnter,
          ),
          registerLayerMouseListener(
            map,
            "mouseleave",
            "mrt-stations-layer",
            handleInteractiveLayerLeave,
          ),
        );


        // Recreation reads as three things: park areas (filled + outlined),
        // park connectors (solid island-wide paths) and trails (dashed paths
        // inside parks, from street zoom). Big parks are labelled first.
        const parksVisibility = sensorVisibilityRef.current.parks ? "visible" : "none";
        map.addSource("parks-data", { type: "geojson", data: filterParks(geoFilterRef.current) });
        map.addLayer({ id: "parks-fill-layer", type: "fill", source: "parks-data", filter: ["==", ["get", "kind"], "park"], layout: { visibility: parksVisibility }, paint: { "fill-color": MAP_COLORS.park, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 10, 0.24, 15, 0.14] } });
        map.addLayer({ id: "parks-outline-layer", type: "line", source: "parks-data", filter: ["==", ["get", "kind"], "park"], layout: { visibility: parksVisibility }, paint: { "line-color": MAP_COLORS.park, "line-width": 0.8, "line-opacity": 0.6 } });
        map.addLayer({ id: "trails-lines-layer", type: "line", source: "parks-data", minzoom: 12, filter: ["==", ["get", "kind"], "trail"], layout: { visibility: parksVisibility, "line-cap": "round", "line-join": "round" }, paint: { "line-color": MAP_COLORS.trail, "line-width": 1.2, "line-opacity": 0.85, "line-dasharray": [1.6, 1.4] } });
        map.addLayer({ id: "pcn-casing-layer", type: "line", source: "parks-data", filter: ["==", ["get", "kind"], "pcn"], layout: { visibility: parksVisibility, "line-cap": "round", "line-join": "round" }, paint: { "line-color": MAP_COLORS.paper, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 5], "line-opacity": 0.7 } });
        map.addLayer({ id: "pcn-lines-layer", type: "line", source: "parks-data", filter: ["==", ["get", "kind"], "pcn"], layout: { visibility: parksVisibility, "line-cap": "round", "line-join": "round" }, paint: { "line-color": MAP_COLORS.parkConnector, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.6, 15, 3] } });
        map.addSource("park-labels", { type: "geojson", data: filterPointFeatures(PARK_LABELS_GEOJSON, geoFilterRef.current) });
        map.addLayer({ id: "parks-label-layer", type: "symbol", source: "park-labels", minzoom: 10.5, layout: {
          visibility: parksVisibility,
          // Only parks of 40 ha+ until street zoom, so the island view isn't a wall of names.
          "text-field": ["step", ["zoom"], ["case", [">=", ["coalesce", ["get", "areaHa"], 0], 40], ["get", "name"], ""], 13, ["get", "name"]],
          "text-size": 10,
          "symbol-sort-key": ["-", 0, ["coalesce", ["get", "areaHa"], 0]],
        }, paint: { "text-color": MAP_COLORS.park, "text-halo-color": MAP_COLORS.paper, "text-halo-width": 1.2 } });
        for (const layerId of ["parks-fill-layer", "pcn-lines-layer", "trails-lines-layer"]) {
          layerListenerCleanups.push(registerLayerMouseListener(map, "click", layerId, handleParkClick), registerLayerMouseListener(map, "mouseenter", layerId, handleInteractiveLayerEnter), registerLayerMouseListener(map, "mouseleave", layerId, handleInteractiveLayerLeave));
        }
        map.addSource("incidents-data", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({ id: "incidents-point-layer", type: "circle", source: "incidents-data", layout: { visibility: sensorVisibilityRef.current.incidents ? "visible" : "none" }, paint: {
          "circle-color": ["match", ["get", "type"], "Accident", MAP_COLORS.danger, "Vehicle Breakdown", MAP_COLORS.warning, "Heavy Traffic", MAP_COLORS.warning, MAP_COLORS.muted],
          "circle-radius": 4,
          "circle-stroke-color": MAP_COLORS.paper,
          "circle-stroke-width": 1,
        } });
        layerListenerCleanups.push(registerLayerMouseListener(map, "mouseenter", "incidents-point-layer", handleIncidentEnter), registerLayerMouseListener(map, "mouseleave", "incidents-point-layer", handleHoverPopupLeave), registerLayerMouseListener(map, "mouseenter", "incidents-point-layer", handleInteractiveLayerEnter), registerLayerMouseListener(map, "mouseleave", "incidents-point-layer", handleInteractiveLayerLeave));
        const availabilityPointPaint = (layerColor: string): maplibregl.CircleLayerSpecification["paint"] => ({
          "circle-color": availabilityColorExpr(layerColor),
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 15, 5.5],
          "circle-stroke-color": MAP_COLORS.paper,
          "circle-stroke-width": 1,
        });
        // Seed from the refs: feed data can land before the style loads, and
        // the data effects only re-run when that data changes.
        const { carparks: carparksVisible, evChargers: evChargersVisible } = sensorVisibilityRef.current;
        for (const [sourceId, layerId, visible, layerColor, onEnter, data] of [
          ["carparks-data", "carparks-point-layer", carparksVisible, MAP_COLORS.carpark, handleCarparkEnter, buildCarparksGeoJson(carparksRef.current.values(), carparksVisible)],
          ["ev-chargers-data", "ev-chargers-point-layer", evChargersVisible, MAP_COLORS.ev, handleEvChargerEnter, buildEvChargersGeoJson(evChargersRef.current.values(), evChargersVisible)],
        ] as const) {
          map.addSource(sourceId, { type: "geojson", data });
          map.addLayer({ id: layerId, type: "circle", source: sourceId, layout: { visibility: visible ? "visible" : "none" }, paint: availabilityPointPaint(layerColor) });
          layerListenerCleanups.push(registerLayerMouseListener(map, "mouseenter", layerId, onEnter), registerLayerMouseListener(map, "mouseleave", layerId, handleHoverPopupLeave), registerLayerMouseListener(map, "mouseenter", layerId, handleInteractiveLayerEnter), registerLayerMouseListener(map, "mouseleave", layerId, handleInteractiveLayerLeave));
        }
        // Planned (under construction) hawker centres are drawn muted.
        for (const [sourceId, prefix, visible, color, data, onEnter, onClick] of [
          ["malls-data", "malls", sensorVisibilityRef.current.malls, MAP_COLORS.mall, MALLS_GEOJSON, handleMallEnter, handleMallClick],
          ["hawkers-data", "hawkers", sensorVisibilityRef.current.hawkers, ["match", ["get", "status"], "planned", MAP_COLORS.muted, MAP_COLORS.hawker], HAWKERS_GEOJSON, handleHawkerEnter, handleHawkerClick],
        ] as const) {
          const visibility = visible ? "visible" : "none";
          map.addSource(sourceId, { type: "geojson", data: filterPointFeatures(data, geoFilterRef.current) });
          map.addLayer({ id: `${prefix}-point-layer`, type: "circle", source: sourceId, layout: { visibility }, paint: {
            "circle-color": color as maplibregl.DataDrivenPropertyValueSpecification<string>,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 15, 7],
            "circle-stroke-color": MAP_COLORS.paper,
            "circle-stroke-width": 1.5,
          } });
          map.addLayer({ id: `${prefix}-label-layer`, type: "symbol", source: sourceId, minzoom: 14, layout: { visibility, "text-field": ["get", "name"], "text-size": 10, "text-offset": [0, 1.1], "text-anchor": "top" }, paint: { "text-color": color as maplibregl.DataDrivenPropertyValueSpecification<string>, "text-halo-color": MAP_COLORS.paper, "text-halo-width": 1 } });
          layerListenerCleanups.push(registerLayerMouseListener(map, "click", `${prefix}-point-layer`, onClick), registerLayerMouseListener(map, "mouseenter", `${prefix}-point-layer`, onEnter), registerLayerMouseListener(map, "mouseleave", `${prefix}-point-layer`, handleHoverPopupLeave), registerLayerMouseListener(map, "mouseenter", `${prefix}-point-layer`, handleInteractiveLayerEnter), registerLayerMouseListener(map, "mouseleave", `${prefix}-point-layer`, handleInteractiveLayerLeave));
        }
      } catch (error) {
        console.warn("MRT layer failed to initialize", error);
      }

      // Separate block so an MRT/sensor layer failure cannot silently drop the
      // air-quality overlay (and vice versa).
      try {
        const airQualityColorExpr: maplibregl.ExpressionSpecification = [
          "match",
          ["get", "tone"],
          "success",
          MAP_COLORS.success,
          "warning",
          MAP_COLORS.warning,
          "danger",
          MAP_COLORS.danger,
          MAP_COLORS.muted,
        ];
        map.addSource("air-quality-regions", {
          type: "geojson",
          data: buildAirQualityGeoJson(airQualityOverlayRef.current),
        });
        map.addLayer({
          id: "air-quality-regions-glow-layer",
          type: "circle",
          source: "air-quality-regions",
          paint: {
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              46,
              12,
              88,
            ],
            "circle-color": airQualityColorExpr,
            "circle-blur": 0.85,
            "circle-opacity": 0.26,
          },
        });
        map.addLayer({
          id: "air-quality-regions-node-layer",
          type: "circle",
          source: "air-quality-regions",
          paint: {
            "circle-radius": 18,
            "circle-color": MAP_COLORS.paper,
            "circle-opacity": 0.88,
            "circle-stroke-width": 1.5,
            "circle-stroke-color": airQualityColorExpr,
          },
        });
        map.addLayer({
          id: "air-quality-regions-label-layer",
          type: "symbol",
          source: "air-quality-regions",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 10,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          },
          paint: {
            "text-color": airQualityColorExpr,
            "text-halo-color": MAP_COLORS.paper,
            "text-halo-width": 1,
          },
        });
      } catch (error) {
        console.warn("Air quality overlay failed to initialize", error);
      }
    };

    const removeMapLoadListener = registerMapLoadListener(map, handleMapLoad);
    map.on("click", handleMapClick);
    if (geoFilterPickingRef.current) map.getCanvas().style.cursor = "crosshair";

    mapRef.current = map;

    return () => {
      removeMapLoadListener();
      map.off("click", handleMapClick);
      for (const removeLayerListener of layerListenerCleanups) {
        removeLayerListener();
      }
      hoverPopupRef.current?.remove();
      hoverPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, [busStopsRef, busStopLookupRef, camerasRef, carparksRef, evChargersRef, flightsRef, incidentsRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    busStopsRef.current = new globalThis.Map(
      busStops.map((stop) => [stop.BusStopCode, stop]),
    );
    busStopLookupRef.current = allBusStops
      ? new globalThis.Map(allBusStops.map((stop) => [stop.BusStopCode, stop]))
      : busStopsRef.current;

    const busStopSource = map.getSource("bus-stops") as
      maplibregl.GeoJSONSource | undefined;
    if (busStopSource) {
      busStopSource.setData(
        buildBusStopGeoJson(sensorVisibility.busStops ? busStops : []),
      );
    }
  }, [allBusStops, busStopLookupRef, busStops, busStopsRef, sensorVisibility.busStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    flightsRef.current = new globalThis.Map(
      flights.map((flight) => [flight.id, flight]),
    );

    const flightsSource = map.getSource("flights") as
      maplibregl.GeoJSONSource | undefined;
    if (!flightsSource) return;

    flightsSource.setData(
      buildFlightGeoJson(sensorVisibility.flights ? flights : []),
    );
  }, [flights, flightsRef, sensorVisibility.flights]);

  // Recolor disrupted operational lines by name; future lines stay unchanged.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("mrt-lines-layer")) return;

    const lineColor: maplibregl.ExpressionSpecification =
      disruptedMrtLines.length > 0
        ? [
            "match",
            ["get", "name"],
            [...disruptedMrtLines],
            MAP_COLORS.danger,
            ["get", "color"],
          ]
        : ["get", "color"];

    map.setPaintProperty("mrt-lines-layer", "line-color", lineColor);
  }, [disruptedMrtLines]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    camerasRef.current = new globalThis.Map(
      cameras.map((camera) => [camera.CameraID, camera]),
    );

    const camerasSource = map.getSource("cameras") as
      maplibregl.GeoJSONSource | undefined;
    if (!camerasSource) return;

    camerasSource.setData(
      buildCameraGeoJson(sensorVisibility.cameras ? cameras : []),
    );
  }, [cameras, camerasRef, sensorVisibility.cameras]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    incidentsRef.current = new globalThis.Map(incidents.map((incident) => [incident.id, incident]));
    const source = map.getSource("incidents-data") as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: (sensorVisibility.incidents ? incidents : []).map((incident) => ({
        type: "Feature" as const,
        properties: { id: incident.id, type: incident.type },
        geometry: { type: "Point" as const, coordinates: [incident.lng, incident.lat] },
      })),
    });
  }, [incidents, incidentsRef, sensorVisibility.incidents]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    carparksRef.current = new globalThis.Map(carparks.map((carpark) => [carpark.id, carpark]));
    const source = map.getSource("carparks-data") as maplibregl.GeoJSONSource | undefined;
    source?.setData(buildCarparksGeoJson(carparks, sensorVisibility.carparks));
  }, [carparks, carparksRef, sensorVisibility.carparks]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    evChargersRef.current = new globalThis.Map(evChargers.map((location) => [location.id, location]));
    const source = map.getSource("ev-chargers-data") as maplibregl.GeoJSONSource | undefined;
    source?.setData(buildEvChargersGeoJson(evChargers, sensorVisibility.evChargers));
  }, [evChargers, evChargersRef, sensorVisibility.evChargers]);

  useEffect(() => {
    airQualityOverlayRef.current = airQualityOverlay;
    const map = mapRef.current;
    if (!map) return;
    const source = map.getSource("air-quality-regions") as
      | maplibregl.GeoJSONSource
      | undefined;
    source?.setData(buildAirQualityGeoJson(airQualityOverlay));
  }, [airQualityOverlay]);

  return { containerRef, mapInitError };
}

export default function Map(props: MapProps) {
  const { containerRef, mapInitError } = useMapController(props);

  if (mapInitError) {
    return (
      <div className="grid h-full w-full place-items-center border border-line bg-surface p-4">
        <div className="max-w-sm text-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-warning">
            Map unavailable
          </div>
          <div className="mt-1.5 text-xs leading-relaxed text-muted">
            The interactive map could not start on this device (MapLibre needs
            WebGL2). Live data panels below remain active.
          </div>
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}

