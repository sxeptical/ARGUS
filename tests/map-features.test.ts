import { describe, expect, test } from "bun:test";
import {
  buildBusStopGeoJson,
  buildCameraGeoJson,
  buildFlightGeoJson,
  MRT_STATION_GEOJSON,
} from "@/lib/map-features";
import type { BusStop, FlightState, TrafficCamera } from "@/types";

const stop = (overrides: Partial<BusStop> = {}): BusStop => ({
  BusStopCode: "01012",
  RoadName: "Victoria St",
  Description: "Bugis Stn",
  Latitude: 1.3,
  Longitude: 103.85,
  ...overrides,
});

const flight = (overrides: Partial<FlightState> = {}): FlightState => ({
  id: "abc123",
  icao24: "abc123",
  callsign: "SIA321",
  originCountry: "Singapore",
  latitude: 1.35,
  longitude: 103.99,
  altitude: 3000,
  velocity: 250,
  track: null,
  verticalRate: 0,
  onGround: false,
  direction: "inbound",
  lastContact: 60,
  ...overrides,
});

const camera = (overrides: Partial<TrafficCamera> = {}): TrafficCamera => ({
  CameraID: "1001",
  Latitude: 1.3,
  Longitude: 103.85,
  ImageLink: "https://example.com/camera.jpg",
  location: "Bugis",
  ...overrides,
});

describe("map feature builders", () => {
  test("builds bus stop properties and rejects invalid coordinates", () => {
    const result = buildBusStopGeoJson([
      stop(),
      stop({ BusStopCode: "invalid", Latitude: Number.NaN }),
    ]);

    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toEqual({
      type: "Feature",
      properties: { BusStopCode: "01012", Description: "Bugis Stn" },
      geometry: { type: "Point", coordinates: [103.85, 1.3] },
    });
  });

  test("defaults a missing flight track and rejects invalid coordinates", () => {
    const result = buildFlightGeoJson([
      flight(),
      flight({ id: "invalid", longitude: Number.POSITIVE_INFINITY }),
    ]);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties).toEqual({
      id: "abc123",
      callsign: "SIA321",
      direction: "inbound",
      track: 0,
    });
  });

  test("builds camera properties and rejects invalid coordinates", () => {
    const result = buildCameraGeoJson([
      camera(),
      camera({ CameraID: "invalid", Latitude: Number.NaN }),
    ]);

    expect(result.features).toHaveLength(1);
    expect(result.features[0].properties).toEqual({
      CameraID: "1001",
      location: "Bugis",
    });
  });

  test("labels only the first occurrence of each MRT station", () => {
    const labels = new Set<string>();
    for (const feature of MRT_STATION_GEOJSON.features) {
      if (!feature.properties.label) continue;
      const key = feature.properties.name.toLowerCase();
      expect(labels.has(key)).toBe(false);
      labels.add(key);
    }
    expect(labels.size).toBeGreaterThan(0);
  });
});
