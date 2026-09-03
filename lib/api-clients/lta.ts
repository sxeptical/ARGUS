/**
 * LTA DataMall clients: bus stops, bus arrivals, and traffic cameras.
 */
import { HttpClient } from "@effect/platform";
import { Effect, Schema } from "effect";
import { Cache } from "@/lib/cache";
import { ExternalApiError, type UpstreamError } from "@/lib/errors";
import {
  LtaBusArrivalsResponseSchema,
  LtaBusStopsResponseSchema,
  LtaTrafficImagesResponseSchema,
} from "@/types/schemas";
import type { RawTrafficImage } from "@/types/schemas";
import type { BusArrival, BusStop, TrafficCamera } from "@/types";
import { DEFAULT_TIMEOUT_MS, httpGetJson, withTimeout } from "./http";

const LTA_BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice";
const BUS_STOPS_TIMEOUT_MS = 35_000; // 35s aggregate timeout for multi-page fetch
const BUS_STOPS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Camera images must come from one of the known LTA hosts. */
const SAFE_CAMERA_IMAGE_URL_RE =
  /^https:\/\/(?:images\.data\.gov\.sg|datamall2\.mytransport\.sg|dm-traffic-camera-itsc\.s3\.ap-southeast-1\.amazonaws\.com)\//i;

const getLtaApiKey = (): Effect.Effect<string, ExternalApiError> =>
  Effect.gen(function* () {
    const apiKey = process.env.LTA_API_KEY?.trim();
    if (!apiKey || apiKey.toLowerCase().includes("your_lta_datamall_key")) {
      return yield* Effect.fail(
        new ExternalApiError({
          service: "lta",
          message: "Missing or placeholder LTA_API_KEY",
          status: 401,
        }),
      );
    }
    return apiKey;
  });

/** Authenticated GET against the LTA OData base URL, schema-decoded. */
export const ltaGet = <A, I>(
  endpoint: string,
  schema: Schema.Schema<A, I, never>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Effect.Effect<A, UpstreamError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const apiKey = yield* getLtaApiKey();
    return yield* httpGetJson(
      "lta",
      `${LTA_BASE_URL}${endpoint}`,
      { AccountKey: apiKey, Accept: "application/json" },
      schema,
      timeoutMs,
    );
  });

type LtaPage<T> = { readonly value: ReadonlyArray<T> } | null;

/**
 * Page an LTA OData collection (in concurrent batches) until an end marker:
 * a short page or an empty/`null` page. If the page cap is reached without
 * an end marker, fail instead of returning a silently truncated dataset.
 */
export const collectLtaPages = <A, E, R>(
  fetchPage: (skip: number) => Effect.Effect<LtaPage<A>, E, R>,
  options: {
    readonly pageSize: number;
    readonly maxPages: number;
    readonly service: string;
    readonly concurrency?: number;
  },
): Effect.Effect<A[], E | ExternalApiError, R> =>
  Effect.gen(function* () {
    const { pageSize, maxPages, service } = options;
    const concurrency = Math.max(1, options.concurrency ?? 1);
    const allRows: A[] = [];
    let pagesProcessed = 0;
    let reachedEnd = false;

    while (pagesProcessed < maxPages && !reachedEnd) {
      const batchSize = Math.min(concurrency, maxPages - pagesProcessed);
      const skips = Array.from(
        { length: batchSize },
        (_, i) => (pagesProcessed + i) * pageSize,
      );
      const batch = yield* Effect.all(
        skips.map((skip) => fetchPage(skip)),
        { concurrency: batchSize },
      );

      for (const page of batch) {
        pagesProcessed += 1;
        if (!page || !Array.isArray(page.value)) {
          reachedEnd = true;
          break;
        }
        allRows.push(...page.value);
        if (page.value.length < pageSize) {
          reachedEnd = true;
          break;
        }
      }
    }

    if (!reachedEnd && pagesProcessed >= maxPages) {
      return yield* Effect.fail(
        new ExternalApiError({
          service,
          status: 502,
          message: `${service} pagination hit the ${maxPages}-page safety cap without an end marker; refusing to use a truncated dataset`,
        }),
      );
    }

    return allRows;
  });

export const getBusStops = (): Effect.Effect<
  BusStop[],
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "bus-stops",
      BUS_STOPS_CACHE_TTL_MS,
      // Aggregate timeout across the whole multi-page walk.
      withTimeout(
        "lta-bus-stops",
        Effect.gen(function* () {
          // Each page is already element-validated by LtaBusStopsResponseSchema;
          // no second decode pass is needed over the accumulated array.
          const pages = yield* collectLtaPages(
            (skip) =>
              ltaGet(
                `/BusStops?$skip=${skip}`,
                LtaBusStopsResponseSchema,
              ).pipe(
                Effect.catchTag("ExternalApiError", (e) =>
                  e.status === 404 ? Effect.succeed(null) : Effect.fail(e),
                ),
              ),
            {
              pageSize: 500,
              maxPages: 20,
              service: "lta",
              concurrency: 4,
            },
          );
          return pages as BusStop[];
        }),
        BUS_STOPS_TIMEOUT_MS,
      ),
    );
  });

export const getBusArrivals = (
  stopId: string,
): Effect.Effect<
  BusArrival[],
  UpstreamError,
  Cache | HttpClient.HttpClient
> => {
  // `stopId` is validated by the route handler (see `BUS_STOP_ID_RE` in
  // `@/lib/route-utils`). The LTA endpoint accepts a wider range than 5
  // digits, so it is passed through unchanged here.
  return Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      `bus-arrivals-${stopId}`,
      15_000,
      Effect.gen(function* () {
        // The v3 endpoint returns `Services: []` for stops with no live
        // arrivals — a valid, successful response, not an error.
        const response = yield* ltaGet(
          `/v3/BusArrival?BusStopCode=${encodeURIComponent(stopId)}`,
          LtaBusArrivalsResponseSchema,
        );
        return [...response.Services] as BusArrival[];
      }),
    );
  });
};

const emptyCameraPayload = { value: [] as readonly RawTrafficImage[] };

export const getTrafficCameras = (): Effect.Effect<
  TrafficCamera[],
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "traffic-cameras",
      60 * 1000,
      Effect.gen(function* () {
        const payload = yield* ltaGet(
          "/Traffic-Imagesv2",
          LtaTrafficImagesResponseSchema,
        ).pipe(
          Effect.catchTag("ExternalApiError", (e) =>
            e.status === 404
              ? Effect.succeed(emptyCameraPayload)
              : Effect.fail(e),
          ),
        );

        // The endpoint returns one of two shapes depending on the upstream
        // wrapper version; both are schema-validated, normalize here.
        const flat: readonly RawTrafficImage[] = payload.value.flatMap(
          (entry) => ("Cameras" in entry ? entry.Cameras : [entry]),
        );

        const cameras: TrafficCamera[] = [];
        for (const camera of flat) {
          if (
            !Number.isFinite(camera.Latitude) ||
            !Number.isFinite(camera.Longitude) ||
            !SAFE_CAMERA_IMAGE_URL_RE.test(camera.ImageLink)
          ) {
            continue;
          }
          cameras.push({
            ...camera,
            location: `Camera ${camera.CameraID}`,
          });
        }
        return cameras;
      }),
    );
  });
