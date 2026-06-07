"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MrtRouteSegment } from "@/lib/mrt-routing";
import type { BusStop, FlightState, MRTGeoJson, TrafficCamera } from "@/types";

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
  mrtRouteSegments?: MrtRouteSegment[];
};

const MRT_LINE_STATIONS: Record<string, string[]> = {
  "North South Line": [
    "Jurong East",
    "Bukit Batok",
    "Bukit Gombak",
    "Choa Chu Kang",
    "Yew Tee",
    "Kranji",
    "Marsiling",
    "Woodlands",
    "Admiralty",
    "Sembawang",
    "Canberra",
    "Yishun",
    "Khatib",
    "Yio Chu Kang",
    "Ang Mo Kio",
    "Bishan",
    "Braddell",
    "Toa Payoh",
    "Novena",
    "Newton",
    "Orchard",
    "Somerset",
    "Dhoby Ghaut",
    "City Hall",
    "Raffles Place",
    "Marina Bay",
    "Marina South Pier",
  ],
  "East West Line": [
    "Tuas Link",
    "Tuas West Road",
    "Tuas Crescent",
    "Gul Circle",
    "Joo Koon",
    "Pioneer",
    "Boon Lay",
    "Lakeside",
    "Chinese Garden",
    "Jurong East",
    "Clementi",
    "Dover",
    "Buona Vista",
    "Commonwealth",
    "Queenstown",
    "Redhill",
    "Tiong Bahru",
    "Outram Park",
    "Tanjong Pagar",
    "Raffles Place",
    "City Hall",
    "Bugis",
    "Lavender",
    "Kallang",
    "Aljunied",
    "Paya Lebar",
    "Eunos",
    "Kembangan",
    "Bedok",
    "Tanah Merah",
    "Simei",
    "Tampines",
    "Pasir Ris",
  ],
  "Changi Airport Branch": [
    "Tanah Merah",
    "Expo",
    "Changi Airport",
  ],
  "North East Line": [
    "HarbourFront",
    "Outram Park",
    "Chinatown",
    "Clarke Quay",
    "Dhoby Ghaut",
    "Little India",
    "Farrer Park",
    "Boon Keng",
    "Potong Pasir",
    "Woodleigh",
    "Serangoon",
    "Kovan",
    "Hougang",
    "Buangkok",
    "Sengkang",
    "Punggol",
    "Punggol Coast",
  ],
  "Circle Line": [
    "Dhoby Ghaut",
    "Bras Basah",
    "Esplanade",
    "Promenade",
    "Nicoll Highway",
    "Stadium",
    "Mountbatten",
    "Dakota",
    "Paya Lebar",
    "MacPherson",
    "Tai Seng",
    "Bartley",
    "Serangoon",
    "Lorong Chuan",
    "Bishan",
    "Marymount",
    "Caldecott",
    "Botanic Gardens",
    "Farrer Road",
    "Holland Village",
    "Buona Vista",
    "one-north",
    "Kent Ridge",
    "Haw Par Villa",
    "Pasir Panjang",
    "Labrador Park",
    "Telok Blangah",
    "HarbourFront",
  ],
  "Circle Line Extension": [
    "HarbourFront",
    "Keppel",
    "Cantonment",
    "Prince Edward Road",
    "Marina Bay",
  ],
  "Downtown Line": [
    "Bukit Panjang",
    "Cashew",
    "Hillview",
    "Beauty World",
    "King Albert Park",
    "Sixth Avenue",
    "Tan Kah Kee",
    "Botanic Gardens",
    "Stevens",
    "Newton",
    "Little India",
    "Rochor",
    "Bugis",
    "Promenade",
    "Bayfront",
    "Downtown",
    "Telok Ayer",
    "Chinatown",
    "Fort Canning",
    "Bencoolen",
    "Jalan Besar",
    "Bendemeer",
    "Geylang Bahru",
    "Mattar",
    "MacPherson",
    "Ubi",
    "Kaki Bukit",
    "Bedok North",
    "Bedok Reservoir",
    "Tampines West",
    "Tampines",
    "Tampines East",
    "Upper Changi",
    "Expo",
  ],
  "Thomson-East Coast Line": [
    "Woodlands North",
    "Woodlands",
    "Woodlands South",
    "Springleaf",
    "Lentor",
    "Mayflower",
    "Bright Hill",
    "Upper Thomson",
    "Caldecott",
    "Stevens",
    "Napier",
    "Orchard Boulevard",
    "Orchard",
    "Great World",
    "Havelock",
    "Outram Park",
    "Maxwell",
    "Shenton Way",
    "Marina Bay",
    "Gardens by the Bay",
    "Tanjong Rhu",
    "Katong Park",
    "Tanjong Katong",
    "Marine Parade",
    "Marine Terrace",
    "Siglap",
    "Bayshore",
    "Bedok South",
    "Sungei Bedok",
  ],
  "Jurong Region Line": [
    "Choa Chu Kang",
    "Choa Chu Kang West",
    "Tengah",
    "Hong Kah",
    "Corporation",
    "Jurong West",
    "Bahar Junction",
    "Boon Lay",
    "Tawas",
    "Nanyang Gateway",
    "Nanyang Crescent",
    "Peng Kang Hill",
    "Tengah Plantation",
    "Tengah Park",
    "Bukit Batok West",
    "Bukit Batok",
  ],
  "Cross Island Line": [
    "Aviation Park",
    "Loyang",
    "Pasir Ris",
    "Tampines North",
    "Defu",
    "Hougang",
    "Serangoon North",
    "Tavistock",
    "Ang Mo Kio",
    "Teck Ghee",
    "Bright Hill",
    "Turf City",
    "King Albert Park",
    "Clementi",
    "West Coast",
    "Jurong Lake District",
  ],
  "Johor Bahru-Singapore RTS": [
    "Bukit Chagar",
    "Woodlands North",
  ],
};

type MRTStationGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      name: string;
      label: string;
      line: string;
      color: string;
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
  }>;
};

type MRTRouteGeoJson = {
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

function interpolateStations(
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
        properties: { name: stationNames[0], label: stationNames[0], line, color },
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
    const ratio = currentSegmentLength > 0
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
      },
      geometry: {
        type: "Point" as const,
        coordinates: [lng, lat] as [number, number],
      },
    };
  });
}

function buildRouteGeoJson(
  mrtLines: MRTGeoJson,
  routeSegments: MrtRouteSegment[],
): MRTRouteGeoJson {
  const features: MRTRouteGeoJson["features"] = [];

  for (const segment of routeSegments) {
    if (segment.stops <= 0) continue;
    const lineFeature = mrtLines.features.find((feature) => feature.properties.name === segment.line);
    if (!lineFeature) continue;

    const stationNames = MRT_LINE_STATIONS[segment.line] ?? [];
    if (stationNames.length === 0 || stationNames.length !== lineFeature.geometry.coordinates.length) {
      continue;
    }

    const fromIndex = stationNames.indexOf(segment.from);
    const toIndex = stationNames.indexOf(segment.to);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) continue;

    const startIndex = Math.min(fromIndex, toIndex);
    const endIndex = Math.max(fromIndex, toIndex);
    const sliced = lineFeature.geometry.coordinates.slice(startIndex, endIndex + 1);
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
  context.fillStyle = "#ffffff";

  context.beginPath();
  context.moveTo(0, -size * 0.34); // nose
  context.lineTo(size * 0.08, -size * 0.10);
  context.lineTo(size * 0.30, -size * 0.02); // right wing tip
  context.lineTo(size * 0.12, size * 0.02);
  context.lineTo(size * 0.12, size * 0.30); // tail fin
  context.lineTo(0, size * 0.24);
  context.lineTo(-size * 0.12, size * 0.30);
  context.lineTo(-size * 0.12, size * 0.02);
  context.lineTo(-size * 0.30, -size * 0.02); // left wing tip
  context.lineTo(-size * 0.08, -size * 0.10);
  context.closePath();
  context.fill();

  return context.getImageData(0, 0, size, size);
}

export default function Map({
  busStops,
  cameras,
  flights,
  sensorVisibility,
  onStopClick,
  onCameraClick,
  onFlightClick,
  onMrtStationClick,
  mrtRouteSegments = [],
}: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cameraMarkersRef = useRef<maplibregl.Marker[]>([]);
  const busStopsRef = useRef<globalThis.Map<string, BusStop>>(new globalThis.Map());
  const flightsRef = useRef<globalThis.Map<string, FlightState>>(new globalThis.Map());
  const onStopClickRef = useRef(onStopClick);
  const onFlightClickRef = useRef(onFlightClick);
  const onMrtStationClickRef = useRef(onMrtStationClick);
  const mrtLinesRef = useRef<MRTGeoJson | null>(null);
  const mrtRouteSegmentsRef = useRef<MrtRouteSegment[]>(mrtRouteSegments);
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

  const applyMrtRouteFocus = (map: maplibregl.Map, hasRoute: boolean) => {
    if (map.getLayer("mrt-lines-layer")) {
      map.setPaintProperty("mrt-lines-layer", "line-opacity", hasRoute ? 0.15 : 0.96);
    }
    if (map.getLayer("mrt-lines-casing-layer")) {
      map.setPaintProperty("mrt-lines-casing-layer", "line-opacity", hasRoute ? 0.12 : 0.84);
    }
    if (map.getLayer("mrt-lines-future-layer")) {
      map.setPaintProperty("mrt-lines-future-layer", "line-opacity", hasRoute ? 0.08 : 0.82);
    }
    if (map.getLayer("mrt-lines-future-casing-layer")) {
      map.setPaintProperty("mrt-lines-future-casing-layer", "line-opacity", hasRoute ? 0.07 : 0.72);
    }
    if (map.getLayer("mrt-stations-layer")) {
      map.setPaintProperty("mrt-stations-layer", "circle-opacity", hasRoute ? 0.3 : 1);
    }
    if (map.getLayer("mrt-stations-label-layer")) {
      map.setPaintProperty("mrt-stations-label-layer", "text-opacity", hasRoute ? 0.35 : 1);
    }
  };

  useEffect(() => {
    sensorVisibilityRef.current = sensorVisibility;
  }, [sensorVisibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const setLayerVisibility = (layerId: string, visible: boolean) => {
      if (!map.getLayer(layerId)) return;
      map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
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
    if (!mrtLinesRef.current) return;
    const routeGeoJson = buildRouteGeoJson(mrtLinesRef.current, mrtRouteSegmentsRef.current);
    const routeSource = map.getSource("mrt-route") as maplibregl.GeoJSONSource | undefined;
    if (routeSource) {
      routeSource.setData(routeGeoJson);
    }
    applyMrtRouteFocus(map, routeGeoJson.features.length > 0);
  }, [mrtRouteSegments]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
            ],
            tileSize: 256,
          },
        },
        layers: [
          {
            id: "carto-layer",
            type: "raster",
            source: "carto",
          },
        ],
      },
      center: [103.8198, 1.3521],
      zoom: 10.8,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", () => {
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
          "circle-color": "#54ffae",
          "circle-opacity": 0.88,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#020b14",
        },
      });

      map.on("click", "bus-stops-layer", (event) => {
        const feature = event.features?.[0];
        const code = feature?.properties?.BusStopCode;
        if (typeof code !== "string") return;
        const stop = busStopsRef.current.get(code);
        if (stop) onStopClickRef.current(stop);
      });

      map.on("mouseenter", "bus-stops-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "bus-stops-layer", () => {
        map.getCanvas().style.cursor = "";
      });

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
            "#54ffae",
            "outbound",
            "#ff6b6b",
            "#6be6ff",
          ],
          "icon-halo-color": "#021019",
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
          "text-color": "#f1f9ff",
          "text-halo-color": "#041118",
          "text-halo-width": 1,
        },
      });

      map.on("click", "flights-layer", (event) => {
        const feature = event.features?.[0];
        const id = feature?.properties?.id;
        if (typeof id !== "string") return;
        const flight = flightsRef.current.get(id);
        if (flight) onFlightClickRef.current(flight);
      });

      map.on("mouseenter", "flights-layer", () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", "flights-layer", () => {
        map.getCanvas().style.cursor = "";
      });

      void (async () => {
        try {
          const response = await fetch("/mrt-lines.json");
          if (!response.ok) throw new Error(`MRT fetch failed: ${response.status}`);
          const geoJson = (await response.json()) as MRTGeoJson;
          mrtLinesRef.current = geoJson;

          map.addSource("mrt-lines", {
            type: "geojson",
            data: geoJson,
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
              "line-color": "#020b14",
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
              "line-color": "#020b14",
              "line-width": 6.2,
              "line-opacity": 0.72,
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
            },
          });

          map.addSource("mrt-route", {
            type: "geojson",
            data: buildRouteGeoJson(geoJson, mrtRouteSegmentsRef.current),
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
              "line-color": "#dff7ff",
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

          applyMrtRouteFocus(map, mrtRouteSegmentsRef.current.length > 0);

          const stationLabelSet = new Set<string>();
          const stationFeatures = geoJson.features.flatMap((lineFeature) => {
            const stationNames = MRT_LINE_STATIONS[lineFeature.properties.name] ?? [];
            const features = interpolateStations(
              lineFeature.geometry.coordinates,
              stationNames,
              lineFeature.properties.name,
              lineFeature.properties.color,
            );

            return features.map((feature) => {
              const stationKey = feature.properties.name.toLowerCase();
              if (stationLabelSet.has(stationKey)) {
                return {
                  ...feature,
                  properties: {
                    ...feature.properties,
                    label: "",
                  },
                };
              }
              stationLabelSet.add(stationKey);
              return feature;
            });
          });

          if (stationFeatures.length > 0) {
            const stationsGeoJson: MRTStationGeoJson = {
              type: "FeatureCollection",
              features: stationFeatures,
            };

            map.addSource("mrt-stations", {
              type: "geojson",
              data: stationsGeoJson,
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
                "circle-stroke-width": 1,
                "circle-stroke-color": "#001018",
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
                "text-color": "#cff6ff",
                "text-halo-color": "#05151f",
                "text-halo-width": 1,
              },
            });

            map.on("click", "mrt-stations-layer", (event) => {
              const feature = event.features?.[0];
              const stationName = feature?.properties?.name;
              if (typeof stationName !== "string" || !stationName.trim()) return;
              onMrtStationClickRef.current?.(stationName);
            });

            map.on("mouseenter", "mrt-stations-layer", () => {
              map.getCanvas().style.cursor = "pointer";
            });

            map.on("mouseleave", "mrt-stations-layer", () => {
              map.getCanvas().style.cursor = "";
            });
          }
        } catch {
          // MRT layer is cosmetic; continue without it
        }
      })();
    });

    mapRef.current = map;

    return () => {
      cameraMarkersRef.current.forEach((marker) => marker.remove());
      cameraMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    busStopsRef.current = new globalThis.Map(
      busStops.map((stop) => [stop.BusStopCode, stop]),
    );

    const busStopSource = map.getSource("bus-stops") as maplibregl.GeoJSONSource | undefined;
    if (busStopSource) {
      busStopSource.setData({
        type: "FeatureCollection",
        features: (sensorVisibility.busStops ? busStops : [])
          .filter(
            (stop) =>
              Number.isFinite(stop.Latitude) &&
              Number.isFinite(stop.Longitude),
          )
          .map((stop) => ({
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
      });
    }
  }, [busStops, sensorVisibility.busStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    flightsRef.current = new globalThis.Map(
      flights.map((flight) => [flight.id, flight]),
    );

    const flightsSource = map.getSource("flights") as maplibregl.GeoJSONSource | undefined;
    if (!flightsSource) return;

    flightsSource.setData({
      type: "FeatureCollection",
      features: (sensorVisibility.flights ? flights : [])
        .filter(
          (flight) =>
            Number.isFinite(flight.latitude) &&
            Number.isFinite(flight.longitude),
        )
        .map((flight) => ({
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
    });
  }, [flights, sensorVisibility.flights]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    cameraMarkersRef.current.forEach((marker) => marker.remove());
    cameraMarkersRef.current = [];

    if (!sensorVisibility.cameras) {
      return;
    }

    cameras.forEach((camera) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "h-3 w-3 rounded-full border border-terminal-bg bg-terminal-cyan";
      el.style.boxShadow = "0 0 10px rgba(107, 230, 255, 0.7)";
      el.title = camera.location;
      el.addEventListener("click", () => onCameraClick(camera));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([camera.Longitude, camera.Latitude])
        .addTo(map);

      cameraMarkersRef.current.push(marker);
    });
  }, [cameras, onCameraClick, sensorVisibility.cameras]);

  return <div ref={containerRef} className="h-full w-full" />;
}
