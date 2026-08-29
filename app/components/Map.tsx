import { useEffect, useRef } from "react";
// maplibre-gl v6 is ESM-only: default imports no longer work, so use a
// namespace import (keeps all maplibregl.* value and type usages intact).
import * as maplibregl from "maplibre-gl";
import { setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// The ESM worker cannot be resolved inside the bundler module graph (its
// maplibre-gl-shared.mjs sibling goes missing), so serve it from public/
// instead. scripts/copy-maplibre-worker.mjs copies both files at build time
// via the predev/prebuild hooks.
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");
import type { MrtRouteSegment } from "@/lib/mrt-routing";
import {
  EMPTY_BUS_ROUTE_GEOJSON,
  EMPTY_BUS_ROUTE_STOPS_GEOJSON,
  buildBusRouteGeoJson,
  buildBusRouteStopsGeoJson,
  fitMapToBusRoute,
  type BusRouteOverlay,
} from "@/app/components/map-bus-route";
export type { BusRouteOverlay } from "@/app/components/map-bus-route";
import {
  MRT_LINES_GEOJSON,
  MRT_STATIONS_GEOJSON,
  applyMrtRouteFocus,
  buildMrtRouteGeoJson,
} from "@/app/components/map-mrt";
import type {
  BusStop,
  FlightState,
  TrafficCamera,
} from "@/types";

type MapProps = {
  busStops: BusStop[];
  cameras: TrafficCamera[];
  flights: FlightState[];
  sensorVisibility: {
    busStops: boolean;
    cameras: boolean;
    flights: boolean;
    mrt: boolean;
  };
  onStopClick: (stop: BusStop) => void;
  onCameraClick: (camera: TrafficCamera) => void;
  onFlightClick: (flight: FlightState) => void;
  onMrtStationClick?: (stationName: string) => void;
  mrtRouteSegments?: ReadonlyArray<MrtRouteSegment>;
  busRouteOverlay?: BusRouteOverlay | null;
};

// MapLibre parses its own color values, so this palette mirrors the CSS design
// tokens in a library-compatible format rather than reading ad-hoc colors.
const MAP_COLORS = {
  paper: "#0a0a0a",
  ink: "#f2f2f2",
  muted: "#8f8f8f",
  success: "#67d391",
  danger: "#ef7373",
  info: "#73b9d9",
  bus: "#54ffae",
} as const;

const EMPTY_MRT_ROUTE_SEGMENTS: MrtRouteSegment[] = [];

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

function useMapController({
  busStops,
  cameras,
  flights,
  sensorVisibility,
  onStopClick,
  onCameraClick,
  onFlightClick,
  onMrtStationClick,
  mrtRouteSegments = EMPTY_MRT_ROUTE_SEGMENTS,
  busRouteOverlay = null,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cameraMarkersRef = useRef<maplibregl.Marker[]>([]);
  const busStopsRef = useLazyRef(createBusStopMap);
  const flightsRef = useLazyRef(createFlightMap);
  const onStopClickRef = useRef(onStopClick);
  const onFlightClickRef = useRef(onFlightClick);
  const onMrtStationClickRef = useRef(onMrtStationClick);
  const mrtRouteSegmentsRef = useRef<ReadonlyArray<MrtRouteSegment>>(
    mrtRouteSegments,
  );
  const busRouteOverlayRef = useRef<BusRouteOverlay | null>(busRouteOverlay);
  const sensorVisibilityRef = useRef(sensorVisibility);

  useEffect(() => {
    onStopClickRef.current = onStopClick;
  }, [onStopClick]);

  useEffect(() => {
    onFlightClickRef.current = onFlightClick;
  }, [onFlightClick]);

  useEffect(() => {
    onMrtStationClickRef.current = onMrtStationClick;
  }, [onMrtStationClick]);

  useEffect(() => {
    sensorVisibilityRef.current = sensorVisibility;
  }, [sensorVisibility]);

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
  }, [sensorVisibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    mrtRouteSegmentsRef.current = mrtRouteSegments;
    const routeGeoJson = buildMrtRouteGeoJson(mrtRouteSegmentsRef.current);
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

    // The overlay changes only when a route/direction changes. Refit on that
    // explicit state transition rather than relying on a lossy hand-built key
    // that can miss same-length geometry changes.
    if (busRouteOverlay) {
      fitMapToBusRoute(map, busRouteOverlay);
    }
  }, [busRouteOverlay]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      // OpenFreeMap is a MapLibre-native, attribution-compliant public
      // basemap with no account or API key. CARTO now watermarks anonymous
      // tile requests with "API KEY REQUIRED".
      style: "https://tiles.openfreemap.org/styles/dark",
      center: [103.8198, 1.3521],
      zoom: 10.8,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const layerListenerCleanups: Array<() => void> = [];
    const handleBusStopClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const code = feature?.properties?.BusStopCode;
      if (typeof code !== "string") return;
      const stop = busStopsRef.current.get(code);
      if (stop) onStopClickRef.current(stop);
    };
    const handleFlightClick = (event: maplibregl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const id = feature?.properties?.id;
      if (typeof id !== "string") return;
      const flight = flightsRef.current.get(id);
      if (flight) onFlightClickRef.current(flight);
    };
    const handleInteractiveLayerEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleInteractiveLayerLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    const handleMrtStationClick = (event: maplibregl.MapLayerMouseEvent) => {
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
      map.getCanvas().style.cursor = routeable ? "pointer" : "";
    };

    const handleMapLoad = () => {
      map.addSource("bus-stops", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: Array.from(busStopsRef.current.values()).map((stop) => ({
            type: "Feature" as const,
            properties: {
              BusStopCode: stop.BusStopCode,
              Description: stop.Description,
            },
            geometry: {
              type: "Point" as const,
              coordinates: [stop.Longitude, stop.Latitude],
            },
          })),
        },
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
        data: {
          type: "FeatureCollection",
          features: Array.from(flightsRef.current.values()).map((flight) => ({
            type: "Feature" as const,
            properties: {
              id: flight.id,
              callsign: flight.callsign,
              direction: flight.direction,
              track: flight.track ?? 0,
            },
            geometry: {
              type: "Point" as const,
              coordinates: [flight.longitude, flight.latitude],
            },
          })),
        },
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

      try {
        map.addSource("mrt-lines", {
          type: "geojson",
          data: MRT_LINES_GEOJSON,
        });

        map.addLayer({
          id: "mrt-lines-casing-layer",
          type: "line",
          source: "mrt-lines",
          filter: ["!=", "status", "future"],
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
          },
          paint: {
            "line-color": MAP_COLORS.paper,
            "line-width": 6.8,
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
          },
          paint: {
            "line-color": ["get", "color"],
            "line-width": 4.2,
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

        const initialRouteGeoJson = buildMrtRouteGeoJson(
          mrtRouteSegmentsRef.current,
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
          data: MRT_STATIONS_GEOJSON,
        });

        map.addLayer({
          id: "mrt-stations-layer",
          type: "circle",
          source: "mrt-stations",
          layout: {
            visibility: sensorVisibilityRef.current.mrt ? "visible" : "none",
          },
          paint: {
            "circle-radius": 4,
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
      } catch (error) {
        console.warn("MRT layer failed to initialize", error);
      }
    };

    const removeMapLoadListener = registerMapLoadListener(map, handleMapLoad);

    mapRef.current = map;

    return () => {
      removeMapLoadListener();
      for (const removeLayerListener of layerListenerCleanups) {
        removeLayerListener();
      }
      cameraMarkersRef.current.forEach((marker) => marker.remove());
      cameraMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [busStopsRef, flightsRef]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    busStopsRef.current = new globalThis.Map(
      busStops.map((stop) => [stop.BusStopCode, stop]),
    );

    const busStopSource = map.getSource("bus-stops") as
      maplibregl.GeoJSONSource | undefined;
    if (busStopSource) {
      busStopSource.setData({
        type: "FeatureCollection",
        features: (sensorVisibility.busStops ? busStops : []).flatMap((stop) =>
          Number.isFinite(stop.Latitude) && Number.isFinite(stop.Longitude)
            ? [
                {
                  type: "Feature" as const,
                  properties: {
                    BusStopCode: stop.BusStopCode,
                    Description: stop.Description,
                  },
                  geometry: {
                    type: "Point" as const,
                    coordinates: [stop.Longitude, stop.Latitude],
                  },
                },
              ]
            : [],
        ),
      });
    }
  }, [busStops, busStopsRef, sensorVisibility.busStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    flightsRef.current = new globalThis.Map(
      flights.map((flight) => [flight.id, flight]),
    );

    const flightsSource = map.getSource("flights") as
      maplibregl.GeoJSONSource | undefined;
    if (!flightsSource) return;

    flightsSource.setData({
      type: "FeatureCollection",
      features: (sensorVisibility.flights ? flights : []).flatMap((flight) =>
        Number.isFinite(flight.latitude) && Number.isFinite(flight.longitude)
          ? [
              {
                type: "Feature" as const,
                properties: {
                  id: flight.id,
                  callsign: flight.callsign,
                  direction: flight.direction,
                  track: flight.track ?? 0,
                },
                geometry: {
                  type: "Point" as const,
                  coordinates: [flight.longitude, flight.latitude],
                },
              },
            ]
          : [],
      ),
    });
  }, [flights, flightsRef, sensorVisibility.flights]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    cameraMarkersRef.current.forEach((marker) => marker.remove());
    cameraMarkersRef.current = [];

    if (!sensorVisibility.cameras) {
      return;
    }

    const container = map.getContainer();
    const camerasById = new globalThis.Map(
      cameras.map((camera) => [camera.CameraID, camera]),
    );
    const handleCameraMarkerClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const markerButton = event.target.closest<HTMLButtonElement>(
        "button[data-camera-id]",
      );
      if (!markerButton || !container.contains(markerButton)) return;
      const cameraId = markerButton.dataset.cameraId;
      if (!cameraId) return;
      const camera = camerasById.get(cameraId);
      if (camera) onCameraClick(camera);
    };

    container.addEventListener("click", handleCameraMarkerClick);

    cameras.forEach((camera) => {
      if (
        !Number.isFinite(camera.Latitude) ||
        !Number.isFinite(camera.Longitude)
      ) {
        return;
      }

      const el = document.createElement("button");
      el.type = "button";
      el.className =
        "h-5 w-5 rounded-full border-2 border-paper bg-ink";
      el.title = camera.location;
      el.setAttribute("aria-label", `View traffic camera ${camera.location}`);
      el.dataset.cameraId = camera.CameraID;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([camera.Longitude, camera.Latitude])
        .addTo(map);

      cameraMarkersRef.current.push(marker);
    });

    return () => {
      container.removeEventListener("click", handleCameraMarkerClick);
      cameraMarkersRef.current.forEach((marker) => marker.remove());
      cameraMarkersRef.current = [];
    };
  }, [cameras, onCameraClick, sensorVisibility.cameras]);

  return containerRef;
}

export default function Map(props: MapProps) {
  const containerRef = useMapController(props);
  return <div ref={containerRef} className="h-full w-full" />;
}
