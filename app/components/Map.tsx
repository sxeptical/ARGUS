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

export default function Map({ busStops, cameras, onStopClick, onCameraClick }: MapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

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
      attributionControl: true,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");

    map.on("load", async () => {
      const response = await fetch("/mrt-lines.json");
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
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    busStops.slice(0, 700).forEach((stop) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "h-2 w-2 rounded-full border border-terminal-bg bg-terminal-green";
      el.style.boxShadow = "0 0 8px rgba(84, 255, 174, 0.8)";
      el.title = `${stop.BusStopCode} ${stop.Description}`;
      el.addEventListener("click", () => onStopClick(stop));

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.Longitude, stop.Latitude])
        .addTo(map);

      markersRef.current.push(marker);
    });

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

      markersRef.current.push(marker);
    });
  }, [busStops, cameras, onStopClick, onCameraClick]);

  return <div ref={containerRef} className="h-full w-full" />;
}
