#!/usr/bin/env bun
/**
 * Accuracy check for bus route geometry matching (not run in CI — it needs
 * the network). Runs `matchPatternsToDirections` over every service in the
 * live BusRouter dataset and reports how often it picks the wrong direction
 * or produces a remaining-route slice that drops upcoming stops.
 *
 * Run with: `bun scripts/check-bus-route-matching.ts`
 *
 * Uses BusRouter's own stop sequences, so it checks the geometry matching
 * without needing an LTA API key. Exits non-zero on any wrong direction.
 */
import {
  decodeGooglePolyline,
  matchPatternsToDirections,
} from "../lib/api-clients/bus-routes.ts";
import type { BusRouteStop } from "../types/index.ts";

const BASE_URL = "https://data.busrouter.sg/v1";
/** Endpoint-to-terminus distance that counts as "starts/ends here". */
const ENDPOINT_RADIUS_M = 300;
/** A stop within this distance of the drawn line counts as covered. */
const COVERED_RADIUS_M = 60;

type LngLat = [number, number];

const fetchJson = async <A>(file: string): Promise<A> => {
  const response = await fetch(`${BASE_URL}/${file}`);
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);
  return (await response.json()) as A;
};

const toMeters = (origin: LngLat, point: LngLat): LngLat => [
  (point[0] - origin[0]) * Math.cos((origin[1] * Math.PI) / 180) * 111_320,
  (point[1] - origin[1]) * 110_540,
];

const distanceToPath = (point: LngLat, path: LngLat[], from = 0): number => {
  let best = Number.POSITIVE_INFINITY;
  for (let i = from; i < path.length - 1; i += 1) {
    const [ax, ay] = toMeters(point, path[i]);
    const [bx, by] = toMeters(point, path[i + 1]);
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t =
      lengthSq === 0
        ? 0
        : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
};

const [routes, services, stopsDb] = await Promise.all([
  fetchJson<Record<string, string[]>>("routes.min.json"),
  fetchJson<Record<string, { name: string; routes: string[][] }>>(
    "services.min.json",
  ),
  fetchJson<Record<string, [number, number, string, string]>>(
    "stops.min.json",
  ),
]);

let directionCount = 0;
let unmatched = 0;
let wrongDirection = 0;
let sliceChecks = 0;
let sliceFailures = 0;
const wrongServices: string[] = [];
const sliceFailureServices = new Set<string>();

for (const [serviceNo, service] of Object.entries(services)) {
  const patterns = (routes[serviceNo] ?? []).map(decodeGooglePolyline);
  const directions = service.routes.map((codes, index) => ({
    direction: index + 1,
    stops: codes.flatMap((code, sequence): BusRouteStop[] => {
      const stop = stopsDb[code];
      return stop
        ? [
            {
              busStopCode: code,
              description: stop[2],
              longitude: stop[0],
              latitude: stop[1],
              stopSequence: sequence + 1,
            },
          ]
        : [];
    }),
  }));
  const matched = matchPatternsToDirections(patterns, directions);

  for (const { direction, stops } of directions) {
    if (stops.length < 2) continue;
    directionCount += 1;
    const fit = matched.get(direction);
    if (!fit) {
      unmatched += 1;
      continue;
    }

    const first: LngLat = [stops[0].longitude, stops[0].latitude];
    const last: LngLat = [stops.at(-1)!.longitude, stops.at(-1)!.latitude];
    const near = (a: LngLat, b: LngLat) =>
      distanceToPath(a, [b, b]) <= ENDPOINT_RADIUS_M;
    const pathStart = fit.path[0];
    const pathEnd = fit.path.at(-1)!;
    if (
      !near(first, last) &&
      near(pathStart, last) &&
      near(pathEnd, first) &&
      !(near(pathStart, first) && near(pathEnd, last))
    ) {
      wrongDirection += 1;
      wrongServices.push(`${serviceNo}/${direction}`);
      continue;
    }

    // A slice drops a stop when the full line covers it but the remaining
    // line does not. Terminus stops often sit inside interchanges, well off
    // the road line, so they are left out.
    const coveredByFullPath = stops.map(
      (stop) =>
        distanceToPath([stop.longitude, stop.latitude], fit.path) <=
        COVERED_RADIUS_M,
    );
    stops.slice(0, -1).forEach((_, k) => {
      sliceChecks += 1;
      const from = fit.stopSegments[k];
      const dropped = stops
        .slice(k + 1, -1)
        .some(
          (stop, offset) =>
            coveredByFullPath[k + 1 + offset] &&
            distanceToPath([stop.longitude, stop.latitude], fit.path, from) >
              COVERED_RADIUS_M,
        );
      if (dropped) {
        sliceFailures += 1;
        sliceFailureServices.add(serviceNo);
      }
    });
  }
}

const pct = (n: number, d: number) => `${((100 * n) / Math.max(d, 1)).toFixed(1)}%`;
console.log(`Directions:            ${directionCount}`);
console.log(
  `No road geometry:      ${unmatched} (${pct(unmatched, directionCount)}) — drawn as stop chords`,
);
console.log(
  `Wrong direction:       ${wrongDirection} (${pct(wrongDirection, directionCount)})${wrongServices.length ? ` ${wrongServices.join(" ")}` : ""}`,
);
console.log(
  `Slices dropping stops: ${sliceFailures} of ${sliceChecks} (${pct(sliceFailures, sliceChecks)}) across ${sliceFailureServices.size} services`,
);

if (wrongDirection > 0) process.exit(1);
