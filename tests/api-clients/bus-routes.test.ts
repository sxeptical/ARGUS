import { describe, expect, test } from "bun:test";
import {
  BUS_ROUTES_MAX_PAGES,
  directionsLeavingStop,
  matchPatternsToDirections,
} from "@/lib/api-clients/bus-routes";
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

function stopsAt(points: Array<[number, number]>): BusRouteStop[] {
  return points.map(([longitude, latitude], index) => ({
    busStopCode: String(10_000 + index),
    description: `Stop ${index}`,
    longitude,
    latitude,
    stopSequence: index + 1,
  }));
}

/** Straight east–west road at `latitude`, one vertex per ~110m. */
function road(
  fromLng: number,
  toLng: number,
  latitude: number,
): Array<[number, number]> {
  const steps = Math.round(Math.abs(toLng - fromLng) / 0.001);
  return Array.from({ length: steps + 1 }, (_, i) => [
    fromLng + ((toLng - fromLng) * i) / steps,
    latitude,
  ]);
}

describe("directionsLeavingStop", () => {
  const route = (direction: number, selectedStopIndex: number | null) => ({
    direction,
    selectedStopIndex,
    stops: [1, 2, 3],
  });

  test("keeps only the direction serving the selected stop", () => {
    expect(
      directionsLeavingStop([route(1, 1), route(2, null)]).map(
        (d) => d.direction,
      ),
    ).toEqual([1]);
  });

  test("drops a direction the stop only terminates", () => {
    // Shared terminus: last stop of direction 1, first stop of direction 2.
    expect(
      directionsLeavingStop([route(1, 2), route(2, 0)]).map((d) => d.direction),
    ).toEqual([2]);
  });

  test("keeps every direction without a selected stop", () => {
    expect(directionsLeavingStop([route(1, null), route(2, null)])).toHaveLength(
      2,
    );
  });
});

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
    expect(matched.get(2)?.path).toEqual(directionTwoPath);
  });

  test("matches each direction to the pattern running in its stop order", () => {
    // Two carriageways ~22m apart; stops sit between them, equally close to
    // both, so only the direction of travel tells the patterns apart.
    const eastbound = road(103.8, 103.83, 1.3);
    const westbound = road(103.83, 103.8, 1.3002);
    const eastStops = stopsAt([
      [103.801, 1.3001],
      [103.81, 1.3001],
      [103.82, 1.3001],
      [103.829, 1.3001],
    ]);
    const westStops = stopsAt(
      eastStops.map((stop) => [stop.longitude, stop.latitude]).reverse() as Array<
        [number, number]
      >,
    );

    // Opposite-direction pattern listed first on purpose.
    const matched = matchPatternsToDirections([westbound, eastbound], [
      { direction: 1, stops: eastStops },
      { direction: 2, stops: westStops },
    ]);

    expect(matched.get(1)?.path).toEqual(eastbound);
    expect(matched.get(2)?.path).toEqual(westbound);
  });

  test("places stops on the pass they belong to when a route reuses a road", () => {
    // Out-and-back: east along 1.3000, then back west ~5m north of it.
    const path = [
      ...road(103.8, 103.82, 1.3),
      ...road(103.82, 103.8, 1.30005),
    ];
    const turnSegment = 20;
    const routeStops = stopsAt([
      [103.8005, 1.3],
      // Outbound stop, but geometrically closer to the return pass.
      [103.805, 1.3001],
      [103.8199, 1.3],
      [103.81, 1.3001],
      [103.8005, 1.3001],
    ]);

    const fit = matchPatternsToDirections([path], [
      { direction: 1, stops: routeStops },
    ]).get(1);

    expect(fit).toBeDefined();
    const segments = fit!.stopSegments;
    // Outbound stop stays on the outbound pass, so the remaining route still
    // includes the turnaround and the return leg.
    expect(segments[1]).toBeLessThan(turnSegment);
    expect(segments[3]).toBeGreaterThanOrEqual(turnSegment);
    expect([...segments].sort((a, b) => a - b)).toEqual(segments);
  });

  test("rotates a loop polyline that starts part-way round to the first stop", () => {
    // Closed rectangle starting at its north-east corner; the interchange
    // (first and last stop) is at the south-west corner.
    const loop: Array<[number, number]> = [
      ...road(103.81, 103.8, 1.31),
      [103.8, 1.305],
      ...road(103.8, 103.81, 1.3),
      [103.81, 1.305],
      [103.81, 1.31],
    ];
    const interchange: [number, number] = [103.8, 1.3];
    const routeStops = stopsAt([
      interchange,
      [103.805, 1.3001],
      [103.8101, 1.305],
      [103.805, 1.3101],
      interchange,
    ]);

    const fit = matchPatternsToDirections([loop], [
      { direction: 1, stops: routeStops },
    ]).get(1);

    expect(fit).toBeDefined();
    expect(fit!.path[0]).toEqual(interchange);
    expect(fit!.path.at(-1)).toEqual(interchange);
    expect(fit!.stopSegments[0]).toBe(0);
    expect(fit!.score).toBeLessThan(15);
  });

  test("falls back to a reversed pattern when only one direction has geometry", () => {
    const eastbound = road(103.8, 103.83, 1.3);
    const westStops = stopsAt([
      [103.829, 1.3001],
      [103.815, 1.3001],
      [103.801, 1.3001],
    ]);

    const fit = matchPatternsToDirections([eastbound], [
      { direction: 2, stops: westStops },
    ]).get(2);

    expect(fit?.path).toEqual([...eastbound].reverse());
  });
});
