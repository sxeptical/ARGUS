"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { BusStop, MRTGeoJson, TrafficCamera } from "@/types";

type MapProps = {
  busStops: BusStop[];
  cameras: TrafficCamera[];
  onStopClick: (stop: BusStop) => void;
  onCameraClick: (camera: TrafficCamera) => void;
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
};

type MRTStationGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      name: string;
      line: string;
      color: string;
    };
    geometry: {
      type: "Point";
      coordinates: [number, number];
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
  if (stationNames.length === 1) {
    const [lng, lat] = coordinates[0];
    return [
      {
        type: "Feature",
        properties: { name: stationNames[0], line, color },
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

export default function Map({ busStops, cameras, onStopClick, onCameraClick }: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const cameraMarkersRef = useRef<maplibregl.Marker[]>([]);
  const busStopsRef = useRef<globalThis.Map<string, BusStop>>(new globalThis.Map());
  const onStopClickRef = useRef(onStopClick);

  useEffect(() => {
    onStopClickRef.current = onStopClick;
  }, [onStopClick]);

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
          features: [],
        },
      });

      map.addLayer({
        id: "bus-stops-layer",
        type: "circle",
        source: "bus-stops",
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

      void (async () => {
        try {
          const response = await fetch("/mrt-lines.json");
          if (!response.ok) throw new Error(`MRT fetch failed: ${response.status}`);
          const geoJson = (await response.json()) as MRTGeoJson;

          map.addSource("mrt-lines", {
            type: "geojson",
            data: geoJson,
          });

          map.addLayer({
            id: "mrt-lines-layer",
            type: "line",
            source: "mrt-lines",
            paint: {
              "line-color": ["get", "color"],
              "line-width": 3,
              "line-opacity": 0.9,
            },
          });

          const stationFeatures = geoJson.features.flatMap((lineFeature) => {
            const stationNames = MRT_LINE_STATIONS[lineFeature.properties.name] ?? [];
            return interpolateStations(
              lineFeature.geometry.coordinates,
              stationNames,
              lineFeature.properties.name,
              lineFeature.properties.color,
            );
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
                "text-field": ["get", "name"],
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
        features: busStops
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
  }, [busStops]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    cameraMarkersRef.current.forEach((marker) => marker.remove());
    cameraMarkersRef.current = [];

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
  }, [cameras, onCameraClick]);

  return <div ref={containerRef} className="h-full w-full" />;
}
