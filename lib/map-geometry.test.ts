import { describe, expect, test } from "bun:test";
import {
  buildBusRouteGeoJson,
  buildBusRouteStopsGeoJson,
  buildRouteGeoJson,
  interpolateStations,
  resolveBusRouteDrawPath,
} from "./map-geometry";
import { MRT_DISPLAY_LINE_STATIONS } from "./mrt-network";

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
});
