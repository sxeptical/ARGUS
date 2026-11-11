import { describe, expect, test } from "bun:test";
import {
  buildBusRouteGeoJson,
  buildBusRouteStopsGeoJson,
  buildRouteGeoJson,
  interpolateStations,
  resolveBusRouteDrawPath,
  routeStationKeys,
} from "@/lib/map-geometry";
import { MRT_STATION_GEOJSON } from "@/lib/map-features";
import { MRT_DISPLAY_LINE_STATIONS } from "@/lib/mrt-network";
import { planMrtRoute } from "@/lib/mrt-routing";
import mrtLinesData from "@/public/mrt-lines.json";
import type { MRTGeoJson } from "@/types";

describe("resolveBusRouteDrawPath", () => {
  test("returns remaining path from selected index", () => {
    const overlay = {
      serviceNo: "12",
      direction: 1,
      stops: [
        {
          busStopCode: "1",
          description: "A",
          latitude: 1,
          longitude: 103,
          stopSequence: 1,
        },
        {
          busStopCode: "2",
          description: "B",
          latitude: 1.1,
          longitude: 103.1,
          stopSequence: 2,
        },
        {
          busStopCode: "3",
          description: "C",
          latitude: 1.2,
          longitude: 103.2,
          stopSequence: 3,
        },
      ],
      selectedStopIndex: 1,
      path: [
        [103, 1],
        [103.1, 1.1],
        [103.2, 1.2],
      ] as Array<readonly [number, number]>,
      selectedPathIndex: 1,
    };
    expect(resolveBusRouteDrawPath(overlay)).toEqual([
      [103.1, 1.1],
      [103.2, 1.2],
    ]);
  });

  test("starts at the selected stop, not the start of its road segment", () => {
    const stop = (n: number, longitude: number, latitude: number) => ({
      busStopCode: String(n),
      description: String(n),
      longitude,
      latitude,
      stopSequence: n,
    });
    // One 1.1km straight segment; the selected stop is ~100m from its end.
    const overlay = {
      serviceNo: "67",
      direction: 2,
      stops: [stop(1, 103.8, 1.3), stop(2, 103.809, 1.3002), stop(3, 103.82, 1.3)],
      selectedStopIndex: 1,
      path: [
        [103.8, 1.3],
        [103.81, 1.3],
        [103.82, 1.3],
      ] as Array<readonly [number, number]>,
      selectedPathIndex: 0,
    };
    const [start, ...rest] = resolveBusRouteDrawPath(overlay);
    expect(start[0]).toBeCloseTo(103.809, 6);
    expect(start[1]).toBeCloseTo(1.3, 6);
    expect(rest).toEqual([
      [103.81, 1.3],
      [103.82, 1.3],
    ]);
  });

  test("draws the whole direction when the selected stop is the terminus", () => {
    const stops = [1, 2, 3].map((n) => ({
      busStopCode: String(n),
      description: String(n),
      latitude: 1 + n / 10,
      longitude: 103 + n / 10,
      stopSequence: n,
    }));
    const path: Array<[number, number]> = stops.map((stop) => [
      stop.longitude,
      stop.latitude,
    ]);
    const overlay = {
      serviceNo: "12",
      direction: 1,
      stops,
      selectedStopIndex: 2,
      path,
      selectedPathIndex: 1,
    };
    expect(resolveBusRouteDrawPath(overlay)).toEqual(path);
    expect(buildBusRouteStopsGeoJson(overlay).features).toHaveLength(3);
  });

  test("falls back to stop chords when no path", () => {
    const overlay = {
      serviceNo: "12",
      direction: 1,
      stops: [
        {
          busStopCode: "1",
          description: "A",
          latitude: 1,
          longitude: 103,
          stopSequence: 1,
        },
        {
          busStopCode: "2",
          description: "B",
          latitude: 1.1,
          longitude: 103.1,
          stopSequence: 2,
        },
      ],
      selectedStopIndex: null,
      path: [],
      selectedPathIndex: null,
    };
    expect(resolveBusRouteDrawPath(overlay)).toEqual([
      [103, 1],
      [103.1, 1.1],
    ]);
  });
});

describe("buildBusRouteGeoJson", () => {
  test("returns empty for null overlay", () => {
    expect(buildBusRouteGeoJson(null).features).toEqual([]);
    expect(buildBusRouteStopsGeoJson(null).features).toEqual([]);
  });
});

describe("buildBusRouteStopsGeoJson roles", () => {
  const stops = [1, 2, 3, 4].map((n) => ({
    busStopCode: String(n),
    description: String(n),
    latitude: 1 + n / 10,
    longitude: 103 + n / 10,
    stopSequence: n,
  }));
  const overlay = (selectedStopIndex: number | null) => ({
    serviceNo: "12",
    direction: 1,
    stops,
    selectedStopIndex,
    path: stops.map(
      (stop) => [stop.longitude, stop.latitude] as [number, number],
    ),
    selectedPathIndex: selectedStopIndex,
  });
  const roles = (selectedStopIndex: number | null) =>
    buildBusRouteStopsGeoJson(overlay(selectedStopIndex)).features.map(
      (feature) => feature.properties.role,
    );

  test("marks only the selected stop, not the route origin", () => {
    expect(roles(1)).toEqual(["selected", "stop", "terminus"]);
    expect(roles(0)).toEqual(["selected", "stop", "stop", "terminus"]);
  });

  test("marks the terminus as selected when that is the selection", () => {
    // resolveRemainingRouteStops returns the whole route in this case; the
    // first stop must not be labelled "selected".
    expect(roles(3)).toEqual(["stop", "stop", "stop", "selected"]);
  });

  test("emits no selected role without a selected stop", () => {
    expect(roles(null)).toEqual(["stop", "stop", "stop", "terminus"]);
  });
});

describe("interpolateStations", () => {
  test("uses vertices directly when counts match", () => {
    const features = interpolateStations(
      [
        [103, 1],
        [103.1, 1.1],
      ],
      ["A", "B"],
      "Test Line",
      "#fff",
    );
    expect(features).toHaveLength(2);
    expect(features[0].geometry.coordinates).toEqual([103, 1]);
  });

  test("distributes evenly when counts differ", () => {
    const features = interpolateStations(
      [
        [0, 0],
        [10, 0],
      ],
      ["A", "B", "C"],
      "Test Line",
      "#fff",
    );
    expect(features).toHaveLength(3);
    expect(features[1].geometry.coordinates[0]).toBeCloseTo(5, 5);
  });
});

describe("buildRouteGeoJson", () => {
  test("returns empty for empty segments", () => {
    const mrtLines = {
      type: "FeatureCollection" as const,
      features: [],
    };
    expect(buildRouteGeoJson(mrtLines, [], MRT_DISPLAY_LINE_STATIONS)).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });

  test("draws a loop route the short way through the interchange", () => {
    const mrtLines = mrtLinesData as MRTGeoJson;
    const line = mrtLines.features.find((feature) => feature.properties.name === "Sengkang LRT East Loop");
    const route = buildRouteGeoJson(mrtLines, [
      { line: "Sengkang LRT East Loop", from: "Ranggung", to: "Compassvale", stops: 2, stations: ["Ranggung", "Sengkang", "Compassvale"] },
    ], MRT_DISPLAY_LINE_STATIONS);
    const coords = (line?.geometry.coordinates ?? []) as [number, number][];
    // Ranggung (index 5) → Sengkang (closing vertex) → Compassvale (index 1).
    expect(route.features[0].geometry.coordinates).toEqual([coords[5], coords[6], coords[1]]);
  });
});

describe("routeStationKeys", () => {
  test("returns nothing without segments, so the route focus stays off", () => {
    expect(routeStationKeys([])).toEqual([]);
  });

  test("matches the ridden line's station points, not other lines' at an interchange", () => {
    const plan = planMrtRoute("Newton", "Bedok");
    const keys = routeStationKeys(plan?.segments ?? []);
    const stationKey = ({ properties }: (typeof MRT_STATION_GEOJSON.features)[number]) => `${properties.line}|${properties.name}`;
    const matched = MRT_STATION_GEOJSON.features.filter((feature) => keys.includes(stationKey(feature)));

    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(matched.map(stationKey))).toEqual(new Set(keys));
    expect(matched.filter((feature) => feature.properties.name === "Newton")).toHaveLength(1);
  });
});
