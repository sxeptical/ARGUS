import { describe, expect, test } from "bun:test";
import { BUS_ROUTES_MAX_PAGES, matchPatternsToDirections } from "@/lib/api-clients/bus-routes";
import type { BusRouteStop } from "@/types";

function stops(longitude: number): BusRouteStop[] {
  return [
    {
      busStopCode: "1",
      description: "A",
      longitude,
      latitude: 1.3,
      stopSequence: 1,
    },
    {
      busStopCode: "2",
      description: "B",
      longitude,
      latitude: 1.31,
      stopSequence: 2,
    },
  ];
}

describe("BUS_ROUTES_MAX_PAGES", () => {
  test("is high enough to cover the known national BusRoutes dataset", () => {
    // LTA returns at most 500 rows/page; current datasets are ~26–27k rows.
    expect(BUS_ROUTES_MAX_PAGES).toBeGreaterThan(40);
    expect(BUS_ROUTES_MAX_PAGES * 500).toBeGreaterThan(30_000);
  });
});

describe("matchPatternsToDirections", () => {
  test("keeps a rejected pattern available for a later direction", () => {
    const directionTwoPath: Array<[number, number]> = [
      [103.82, 1.3],
      [103.82, 1.31],
    ];
    const matched = matchPatternsToDirections([directionTwoPath], [
      { direction: 1, stops: stops(103.8) },
      { direction: 2, stops: stops(103.82) },
    ]);

    expect(matched.has(1)).toBe(false);
    expect(matched.get(2)).toBe(directionTwoPath);
  });
});
