import mrtLinesData from "@/public/mrt-lines.json";
import {
  interpolateStations,
  type MRTStationGeoJson,
} from "@/lib/map-geometry";
import { MRT_DISPLAY_LINE_STATIONS } from "@/lib/mrt-network";
import type {
  BusStop,
  FlightState,
  MRTGeoJson,
  TrafficCamera,
} from "@/types";

type PointFeatureCollection<P> = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: P;
    geometry: { type: "Point"; coordinates: [number, number] };
  }>;
};

export function buildBusStopGeoJson(
  stops: Iterable<BusStop>,
): PointFeatureCollection<Pick<BusStop, "BusStopCode" | "Description">> {
  return {
    type: "FeatureCollection",
    features: Array.from(stops).flatMap((stop) =>
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
  };
}

export function buildFlightGeoJson(
  flights: Iterable<FlightState>,
): PointFeatureCollection<{
  id: string;
  callsign: string;
  direction: FlightState["direction"];
  track: number;
}> {
  return {
    type: "FeatureCollection",
    features: Array.from(flights).flatMap((flight) =>
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
  };
}

export function buildCameraGeoJson(
  cameras: Iterable<TrafficCamera>,
): PointFeatureCollection<Pick<TrafficCamera, "CameraID" | "location">> {
  return {
    type: "FeatureCollection",
    features: Array.from(cameras).flatMap((camera) =>
      Number.isFinite(camera.Latitude) && Number.isFinite(camera.Longitude)
        ? [
            {
              type: "Feature" as const,
              properties: {
                CameraID: camera.CameraID,
                location: camera.location,
              },
              geometry: {
                type: "Point" as const,
                coordinates: [camera.Longitude, camera.Latitude],
              },
            },
          ]
        : [],
    ),
  };
}

function buildMrtStationGeoJson(): MRTStationGeoJson {
  const labelledStations = new Set<string>();
  const features = (mrtLinesData as MRTGeoJson).features.flatMap(
    (lineFeature) => {
      const line = lineFeature.properties.name;
      return interpolateStations(
        lineFeature.geometry.coordinates,
        MRT_DISPLAY_LINE_STATIONS[line] ?? [],
        line,
        lineFeature.properties.color,
      ).map((feature) => {
        const stationKey = feature.properties.name.toLowerCase();
        if (labelledStations.has(stationKey)) {
          return {
            ...feature,
            properties: { ...feature.properties, label: "" },
          };
        }
        labelledStations.add(stationKey);
        return feature;
      });
    },
  );
  return { type: "FeatureCollection", features };
}

export const MRT_STATION_GEOJSON = buildMrtStationGeoJson();
