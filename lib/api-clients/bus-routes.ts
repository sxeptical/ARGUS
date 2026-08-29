/**
 * Bus route clients: the LTA BusRoutes index (service → direction → ordered
 * stops), road-following geometry from BusRouter/sgbusdata, and the join
 * that produces a `BusRouteResponse`.
 */
import { HttpClient } from "@effect/platform";
import { Effect, Schema } from "effect";
import { Cache } from "@/lib/cache";
import {
  ExternalApiError,
  fromParseError,
  type UpstreamError,
} from "@/lib/errors";
import {
  BusRouteResponseSchema,
  LtaBusRoutesResponseSchema,
} from "@/types/schemas";
import type {
  BusRouteDirection,
  BusRouteResponse,
  BusRouteStop,
} from "@/types";
import { getBusStops, ltaGet, collectLtaPages } from "./lta";
import { httpGetJson, withTimeout } from "./http";

// Road-following encoded polylines (Google polyline format) from BusRouter SG /
// cheeaun/sgbusdata. Used so routes hug roads instead of cutting through parks.
const BUSROUTER_ROUTES_URL = "https://data.busrouter.sg/v1/routes.min.json";
const BUSROUTER_ROUTES_FALLBACK_URL =
  "https://cdn.jsdelivr.net/gh/cheeaun/sgbusdata@master/data/v1/routes.min.json";
const BUS_ROUTES_TIMEOUT_MS = 90_000; // 90s aggregate timeout for multi-page BusRoutes
const BUS_ROUTES_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const BUS_ROUTES_PAGE_SIZE = 500;
const BUS_ROUTES_PAGE_CONCURRENCY = 4;
/** Safety cap above the known ~26–27k-row BusRoutes dataset (500 rows/page). */
export const BUS_ROUTES_MAX_PAGES = 128;
const BUSROUTER_GEOMETRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/**
 * When both geometry sources fail, remember that for a few minutes so each
 * bus-route request does not pay two slow upstream timeouts. This is an
 * explicit, short negative marker — not a 24h empty "success".
 */
const BUSROUTER_GEOMETRY_NEGATIVE_TTL_MS = 5 * 60 * 1000;
const BUSROUTER_GEOMETRY_TIMEOUT_MS = 15_000;
const MAX_BUSROUTER_PATH_POINTS = 2_500;
/** Reject absurd pattern matches (> ~800m average stop distance). */
export const MAX_PATTERN_MATCH_DISTANCE_M = 800;

// ---------- Bus routes index ----------

type IndexedBusRouteStop = {
  readonly busStopCode: string;
  readonly stopSequence: number;
};

/** ServiceNo → Direction → ordered stop codes (pre-join). */
type BusRoutesIndex = Map<string, Map<number, IndexedBusRouteStop[]>>;

const toFiniteNumber = (value: number | string): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildBusRoutesIndex = (
  rows: ReadonlyArray<{
    readonly ServiceNo: string;
    readonly Direction: number | string;
    readonly StopSequence: number | string;
    readonly BusStopCode: string;
  }>,
): BusRoutesIndex => {
  // Accumulate unordered, then sort each direction by StopSequence.
  const raw: BusRoutesIndex = new Map();

  for (const row of rows) {
    const serviceNo = row.ServiceNo?.trim();
    const busStopCode = row.BusStopCode?.trim();
    const direction = toFiniteNumber(row.Direction);
    const stopSequence = toFiniteNumber(row.StopSequence);
    if (
      !serviceNo ||
      !busStopCode ||
      direction === null ||
      stopSequence === null
    ) {
      continue;
    }

    let byDirection = raw.get(serviceNo);
    if (!byDirection) {
      byDirection = new Map();
      raw.set(serviceNo, byDirection);
    }
    let stops = byDirection.get(direction);
    if (!stops) {
      stops = [];
      byDirection.set(direction, stops);
    }
    stops.push({ busStopCode, stopSequence });
  }

  for (const byDirection of raw.values()) {
    for (const [direction, stops] of byDirection) {
      stops.sort((a, b) => a.stopSequence - b.stopSequence);
      byDirection.set(direction, stops);
    }
  }

  return raw;
};

const fetchAndIndexBusRoutes = (): Effect.Effect<
  BusRoutesIndex,
  UpstreamError,
  HttpClient.HttpClient
> =>
  withTimeout(
    "lta-bus-routes",
    Effect.gen(function* () {
      const allRows = yield* collectLtaPages(
        (skip) =>
          ltaGet(`/BusRoutes?$skip=${skip}`, LtaBusRoutesResponseSchema).pipe(
            Effect.catchTag("ExternalApiError", (e) =>
              e.status === 404 ? Effect.succeed(null) : Effect.fail(e),
            ),
          ),
        {
          pageSize: BUS_ROUTES_PAGE_SIZE,
          maxPages: BUS_ROUTES_MAX_PAGES,
          service: "lta",
          concurrency: BUS_ROUTES_PAGE_CONCURRENCY,
        },
      );
      return buildBusRoutesIndex(allRows);
    }),
    BUS_ROUTES_TIMEOUT_MS,
  );

const getBusRoutesIndex = (): Effect.Effect<
  BusRoutesIndex,
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "bus-routes-index",
      BUS_ROUTES_CACHE_TTL_MS,
      fetchAndIndexBusRoutes(),
    );
  });

// ---------- BusRouter geometry ----------

/**
 * Decode a Google-encoded polyline into [lng, lat] pairs.
 * BusRouter / sgbusdata stores patterns in this format.
 */
const decodeGooglePolyline = (encoded: string): Array<[number, number]> => {
  const coordinates: Array<[number, number]> = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lng / 1e5, lat / 1e5]);
  }

  return coordinates;
};

/** Downsample long polylines so client payloads stay reasonable. */
const downsamplePath = (
  path: Array<[number, number]>,
  maxPoints: number,
): Array<[number, number]> => {
  if (path.length <= maxPoints) return path;
  const result: Array<[number, number]> = [];
  const last = path.length - 1;
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.round((i * last) / (maxPoints - 1));
    result.push(path[idx]);
  }
  return result;
};

const haversineMeters = (
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number,
): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
};

const nearestPathIndex = (
  path: Array<[number, number]>,
  lng: number,
  lat: number,
): number => {
  let bestIdx = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length; i += 1) {
    const [plng, plat] = path[i];
    const d = haversineMeters(lng, lat, plng, plat);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
};

/**
 * Score how well a road polyline matches an ordered stop sequence by summing
 * nearest-point distances. Lower is better.
 */
const scorePathAgainstStops = (
  path: Array<[number, number]>,
  stops: BusRouteStop[],
): number => {
  if (path.length === 0 || stops.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  let sampleCount = 0;
  // Sample up to 12 stops evenly (always include first + last).
  const sampleIdx = new Set<number>([0, stops.length - 1]);
  const midSamples = Math.min(10, Math.max(0, stops.length - 2));
  for (let i = 1; i <= midSamples; i += 1) {
    sampleIdx.add(Math.round((i * (stops.length - 1)) / (midSamples + 1)));
  }
  for (const i of sampleIdx) {
    const stop = stops[i];
    let best = Number.POSITIVE_INFINITY;
    for (const [lng, lat] of path) {
      const d = haversineMeters(stop.longitude, stop.latitude, lng, lat);
      if (d < best) best = d;
    }
    total += best;
    sampleCount += 1;
  }
  return sampleCount === 0 ? Number.POSITIVE_INFINITY : total / sampleCount;
};

/** ServiceNo → decoded pattern polylines [lng, lat][] (one per direction pattern). */
type BusRouterGeometryIndex = Map<string, Array<Array<[number, number]>>>;

// Permissive: object of serviceNo → encoded polyline string[]; entries are
// validated while decoding patterns below.
const BusRouterRoutesSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

const decodeGeometryIndex = (body: unknown): BusRouterGeometryIndex => {
  const index: BusRouterGeometryIndex = new Map();
  if (!body || typeof body !== "object") return index;
  for (const [serviceNo, patterns] of Object.entries(
    body as Record<string, unknown>,
  )) {
    if (!Array.isArray(patterns)) continue;
    const decodedPatterns: Array<Array<[number, number]>> = [];
    for (const pattern of patterns) {
      if (typeof pattern !== "string" || pattern.length < 4) continue;
      try {
        const path = downsamplePath(
          decodeGooglePolyline(pattern),
          MAX_BUSROUTER_PATH_POINTS,
        );
        if (path.length >= 2) decodedPatterns.push(path);
      } catch {
        // Skip malformed encodings.
      }
    }
    if (decodedPatterns.length > 0) {
      index.set(serviceNo, decodedPatterns);
    }
  }
  return index;
};

const fetchBusRouterGeometryIndex = (): Effect.Effect<
  BusRouterGeometryIndex,
  UpstreamError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const urls = [BUSROUTER_ROUTES_URL, BUSROUTER_ROUTES_FALLBACK_URL];
    for (const url of urls) {
      const decoded = yield* httpGetJson(
        "busrouter",
        url,
        { Accept: "application/json" },
        BusRouterRoutesSchema,
        BUSROUTER_GEOMETRY_TIMEOUT_MS,
      ).pipe(
        Effect.map(decodeGeometryIndex),
        // Per-source failure falls through to the next URL.
        Effect.catchAll(() => Effect.succeed(null)),
      );

      if (decoded && decoded.size > 0) {
        return decoded;
      }
    }
    return yield* Effect.fail(
      new ExternalApiError({
        service: "busrouter",
        status: 502,
        message: "No BusRouter geometry source is currently reachable",
      }),
    );
  });

const EMPTY_GEOMETRY_INDEX: BusRouterGeometryIndex = new Map();

/**
 * Geometry is optional data: a total failure must not fail bus-route
 * requests (they fall back to stop chords), so failures resolve to an empty
 * index for a short, explicit negative window.
 */
const getBusRouterGeometryIndex = (): Effect.Effect<
  BusRouterGeometryIndex,
  never,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    const recentlyUnavailable = yield* cache.peek<BusRouterGeometryIndex>(
      "busrouter-geometry-unavailable",
      BUSROUTER_GEOMETRY_NEGATIVE_TTL_MS,
    );
    if (recentlyUnavailable) return recentlyUnavailable;

    return yield* cache
      .get(
        "busrouter-geometry-index",
        BUSROUTER_GEOMETRY_CACHE_TTL_MS,
        fetchBusRouterGeometryIndex(),
      )
      .pipe(
        Effect.catchAll(() =>
          cache.get(
            "busrouter-geometry-unavailable",
            BUSROUTER_GEOMETRY_NEGATIVE_TTL_MS,
            Effect.succeed(EMPTY_GEOMETRY_INDEX),
          ),
        ),
      );
  });

/**
 * Greedy bipartite match: assign each direction its best remaining pattern.
 * A pattern is consumed only when it is actually accepted — a pattern that
 * is too far from direction 1 may still be the correct match for direction 2.
 */
export const matchPatternsToDirections = (
  patterns: Array<Array<[number, number]>>,
  directions: Array<{ direction: number; stops: BusRouteStop[] }>,
): Map<number, Array<[number, number]>> => {
  const result = new Map<number, Array<[number, number]>>();
  if (patterns.length === 0 || directions.length === 0) return result;

  const remaining = patterns.map((path) => path);
  const sortedDirs = [...directions].sort((a, b) => a.direction - b.direction);

  for (const dir of sortedDirs) {
    if (remaining.length === 0) break;
    let bestIdx = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i += 1) {
      const score = scorePathAgainstStops(remaining[i], dir.stops);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (bestScore < MAX_PATTERN_MATCH_DISTANCE_M) {
      result.set(dir.direction, remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    }
    // Rejected patterns stay available for later directions.
  }

  return result;
};

// ---------- Route assembly ----------

const findCaseInsensitiveKey = (
  index: Map<string, unknown>,
  serviceNo: string,
): string | null => {
  const lower = serviceNo.toLowerCase();
  for (const key of index.keys()) {
    if (key.toLowerCase() === lower) return key;
  }
  return null;
};

export const getBusRoute = (
  serviceNo: string,
  stopId?: string,
): Effect.Effect<
  BusRouteResponse,
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const normalizedService = serviceNo.trim();
    const index = yield* getBusRoutesIndex();

    // LTA service numbers are case-sensitive in practice for letter
    // suffixes (e.g. 12e). Try exact match first, then case-insensitive.
    let serviceKey = normalizedService;
    let directionsMap = index.get(normalizedService) ?? null;
    if (!directionsMap) {
      const matched = findCaseInsensitiveKey(index, normalizedService);
      if (matched !== null) {
        serviceKey = matched;
        directionsMap = index.get(matched) ?? null;
      }
    }

    if (!directionsMap || directionsMap.size === 0) {
      return yield* Effect.fail(
        new ExternalApiError({
          service: "lta",
          status: 404,
          message: `Bus service ${normalizedService} was not found`,
        }),
      );
    }

    const stopsCatalog = yield* getBusStops();
    const stopByCode = new Map(
      stopsCatalog.map((stop) => [stop.BusStopCode, stop]),
    );

    const contextStopId = stopId?.trim() || null;

    const draft = [...directionsMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([direction, indexedStops]) => {
        const joined: BusRouteStop[] = [];
        for (const entry of indexedStops) {
          const stop = stopByCode.get(entry.busStopCode);
          if (
            !stop ||
            !Number.isFinite(stop.Latitude) ||
            !Number.isFinite(stop.Longitude)
          ) {
            continue;
          }
          joined.push({
            busStopCode: entry.busStopCode,
            description: stop.Description,
            latitude: stop.Latitude,
            longitude: stop.Longitude,
            stopSequence: entry.stopSequence,
          });
        }

        let selectedStopIndex: number | null = null;
        if (contextStopId) {
          const idx = joined.findIndex((s) => s.busStopCode === contextStopId);
          if (idx >= 0) {
            selectedStopIndex = idx;
          }
        }

        const originCode =
          joined[0]?.busStopCode ?? indexedStops[0]?.busStopCode ?? "";
        const destinationCode =
          joined[joined.length - 1]?.busStopCode ??
          indexedStops[indexedStops.length - 1]?.busStopCode ??
          "";

        return {
          direction,
          selectedStopIndex,
          originCode,
          destinationCode,
          stops: joined,
        };
      })
      .filter((dir) => dir.stops.length >= 2);

    if (draft.length === 0) {
      return yield* Effect.fail(
        new ExternalApiError({
          service: "lta",
          status: 404,
          message: `Bus service ${serviceKey} has no mappable stops`,
        }),
      );
    }

    // Prefer a direction only when the context stop appears on exactly one.
    const matchingDirections = draft
      .filter((dir) => dir.selectedStopIndex !== null)
      .map((dir) => dir.direction);
    const preferredDir =
      matchingDirections.length === 1 ? matchingDirections[0] : null;

    // Attach road-following geometry when BusRouter data is available.
    const geometryIndex = yield* getBusRouterGeometryIndex();
    let patterns =
      geometryIndex.get(serviceKey) ??
      geometryIndex.get(normalizedService) ??
      null;
    if (!patterns) {
      const geometryKey = findCaseInsensitiveKey(geometryIndex, serviceKey);
      if (geometryKey !== null) {
        patterns = geometryIndex.get(geometryKey) ?? null;
      }
    }
    const pathByDirection = matchPatternsToDirections(
      patterns ?? [],
      draft.map((d) => ({ direction: d.direction, stops: d.stops })),
    );

    const directions: BusRouteDirection[] = draft.map((dir) => {
      const path = pathByDirection.get(dir.direction) ?? [];
      let selectedPathIndex: number | null = null;
      const selectedStop =
        dir.selectedStopIndex !== null
          ? dir.stops[dir.selectedStopIndex]
          : undefined;
      if (path.length >= 2 && selectedStop) {
        selectedPathIndex = nearestPathIndex(
          path,
          selectedStop.longitude,
          selectedStop.latitude,
        );
      }

      return {
        direction: dir.direction,
        selectedStopIndex: dir.selectedStopIndex,
        originCode: dir.originCode,
        destinationCode: dir.destinationCode,
        stops: dir.stops,
        preferred: preferredDir !== null && dir.direction === preferredDir,
        path,
        selectedPathIndex,
      };
    });

    // Validate the assembled response against the shared contract so the
    // schema in @/types/schemas stays the source of truth for the client.
    return yield* Schema.decodeUnknown(BusRouteResponseSchema)({
      serviceNo: serviceKey,
      directions,
    }).pipe(Effect.mapError((cause) => fromParseError("lta", cause)));
  });
