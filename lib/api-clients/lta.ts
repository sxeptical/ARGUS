/**
 * LTA DataMall clients: bus stops, bus arrivals, traffic cameras, train
 * service alerts, carpark availability, and EV charging points.
 */
import { HttpClient } from "@effect/platform";
import { createHash } from "node:crypto";
import { Effect, Schema } from "effect";
import { Cache } from "@/lib/cache";
import { ExternalApiError, type UpstreamError } from "@/lib/errors";
import {
  LtaBusArrivalsResponseSchema,
  LtaBusStopsResponseSchema,
  LtaCarparkAvailabilityResponseSchema,
  LtaEvBatchFileSchema,
  LtaEvcBatchResponseSchema,
  LtaTrafficImagesResponseSchema,
  LtaTrafficIncidentsResponseSchema,
  LtaTrainServiceAlertsResponseSchema,
} from "@/types/schemas";
import type {
  LtaTrainServiceAlert,
  RawCarparkAvailability,
  RawEvLocation,
  LtaTrainServiceAlertsResponse,
  RawTrafficImage,
  RawTrafficIncident,
} from "@/types/schemas";
import type {
  BusArrival,
  BusStop,
  CarparkAvailability,
  EvChargingLocation,
  TrafficCamera,
  TrafficIncident,
  TrainServiceAlert,
} from "@/types";
import { DEFAULT_TIMEOUT_MS, httpGetJson, withTimeout } from "./http";
import { LTA_LINE_CODE_TO_DISPLAY_NAME } from "@/lib/mrt-network";

const LTA_BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice";
const BUS_STOPS_TIMEOUT_MS = 35_000; // 35s aggregate timeout for multi-page fetch
const BUS_STOPS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Camera images must come from one of the known LTA hosts. */
const SAFE_CAMERA_IMAGE_URL_RE =
  /^https:\/\/(?:images\.data\.gov\.sg|datamall2\.mytransport\.sg|dm-traffic-camera-itsc\.s3\.ap-southeast-1\.amazonaws\.com)\//i;
/** The EV batch link must point at LTA's dataset bucket before we follow it. */
const SAFE_EV_BATCH_URL_RE =
  /^https:\/\/dmprod-datasets\.s3\.ap-southeast-1\.amazonaws\.com\//i;

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

export const getTrafficIncidents = (): Effect.Effect<TrafficIncident[], UpstreamError, Cache | HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get("incidents", 60_000, Effect.gen(function* () {
      const payload = yield* ltaGet("/TrafficIncidents", LtaTrafficIncidentsResponseSchema);
      return normalizeTrafficIncidents(payload.value);
    }));
  });

export const normalizeTrafficIncidents = (rows: ReadonlyArray<RawTrafficIncident>): TrafficIncident[] =>
  rows.flatMap((incident) => {
        if (!Number.isFinite(incident.Latitude) || !Number.isFinite(incident.Longitude)) return [];
        const id = createHash("sha256").update(`${incident.Message}|${incident.Latitude}|${incident.Longitude}`).digest("hex").slice(0, 16);
        return [{ id, type: incident.Type, lat: incident.Latitude, lng: incident.Longitude, message: incident.Message }];
      });

const TRAIN_ALERTS_CACHE_TTL_MS = 60 * 1000;

/** Status 1 = normal service, 2 = disrupted (LTA DataMall). */
const DISRUPTED_STATUS = 2;

const normalizeAlertMessage = (alert: LtaTrainServiceAlert): string => {
  const contents = (alert.Message ?? [])
    .map((entry) => entry.Content?.trim() ?? "")
    .filter(Boolean);
  return contents.join(" ");
};

const normalizeLineCode = (code: string): string =>
  LTA_LINE_CODE_TO_DISPLAY_NAME[code] ?? code;

/**
 * Normalize an LTA TrainServiceAlerts payload (either wrapper shape) into
 * the client-facing `TrainServiceAlert[]`. Pure and side-effect free so it
 * is directly unit-testable.
 */
export const normalizeTrainServiceAlerts = (
  payload: LtaTrainServiceAlertsResponse,
): TrainServiceAlert[] => {
  const rows: readonly LtaTrainServiceAlert[] = Array.isArray(payload.value)
    ? payload.value
    : [payload.value];

  return rows.map((row) => {
    const segments = row.AffectedSegments ?? [];
    const statusValue =
      typeof row.Status === "string" ? Number(row.Status) : row.Status;
    const lineNames = [
      ...new Set(
        segments
          .flatMap((segment) =>
            segment.Line?.trim() ? [segment.Line.trim()] : [],
          )
          .map(normalizeLineCode),
      ),
    ].sort((a, b) => a.localeCompare(b, "en-SG"));
    const stations = [
      ...new Set(
        segments.flatMap((segment) =>
          (segment.Stations ?? []).filter((code) => code.trim() !== ""),
        ),
      ),
    ];

    return {
      status: statusValue === DISRUPTED_STATUS ? "disrupted" : "normal",
      message: normalizeAlertMessage(row),
      affectedLines: lineNames,
      affectedStations: stations,
      startTime: row.Start_time ?? null,
      endTime: row.End_time ?? null,
    };
  });
};

export const getTrainServiceAlerts = (): Effect.Effect<
  TrainServiceAlert[],
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "train-service-alerts",
      TRAIN_ALERTS_CACHE_TTL_MS,
      Effect.gen(function* () {
        const payload = yield* ltaGet(
          "/TrainServiceAlerts",
          LtaTrainServiceAlertsResponseSchema,
        );
        return normalizeTrainServiceAlerts(payload);
      }),
    );
  });

// LTA refreshes carpark availability every minute.
const CARPARKS_CACHE_TTL_MS = 60 * 1000;
const CARPARKS_TIMEOUT_MS = 30_000;

/**
 * Merge the per-lot-type DataMall rows into one entry per carpark. Rows with
 * an unparseable `Location` are dropped; lot types other than car (C),
 * motorcycle (Y), and heavy vehicle (H) are ignored.
 */
export const normalizeCarparkAvailability = (
  rows: ReadonlyArray<RawCarparkAvailability>,
): CarparkAvailability[] => {
  const byId = new globalThis.Map<string, CarparkAvailability>();
  for (const row of rows) {
    const [lat, lng] = row.Location.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const id = `${row.Agency}:${row.CarParkID}`;
    let carpark = byId.get(id);
    if (!carpark) {
      carpark = {
        id,
        name: row.Development.trim() || `Carpark ${row.CarParkID}`,
        area: row.Area.trim(),
        agency: row.Agency,
        lat,
        lng,
        carLots: null,
        motorcycleLots: null,
        heavyLots: null,
      };
      byId.set(id, carpark);
    }
    if (row.LotType === "C") carpark.carLots = row.AvailableLots;
    else if (row.LotType === "Y") carpark.motorcycleLots = row.AvailableLots;
    else if (row.LotType === "H") carpark.heavyLots = row.AvailableLots;
  }
  return [...byId.values()];
};

export const getCarparkAvailability = (): Effect.Effect<
  CarparkAvailability[],
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "carpark-availability",
      CARPARKS_CACHE_TTL_MS,
      withTimeout(
        "lta-carparks",
        Effect.gen(function* () {
          const rows = yield* collectLtaPages(
            (skip) =>
              ltaGet(
                `/CarParkAvailabilityv2?$skip=${skip}`,
                LtaCarparkAvailabilityResponseSchema,
              ),
            {
              pageSize: 500,
              maxPages: 12,
              service: "lta",
              concurrency: 3,
            },
          );
          return normalizeCarparkAvailability(rows);
        }),
        CARPARKS_TIMEOUT_MS,
      ),
    );
  });

// LTA regenerates the EV batch snapshot every five minutes.
const EV_CHARGERS_CACHE_TTL_MS = 5 * 60 * 1000;
const EV_BATCH_FILE_TIMEOUT_MS = 30_000;

/** Connector status codes in the EV batch file. */
const EV_AVAILABLE = "1";
const EV_OCCUPIED = "0";

/**
 * Summarize each EV location's charging points into connector counts, peak
 * power, and operator/plug lists. Pure, so it is directly unit-testable.
 */
export const normalizeEvChargingLocations = (
  rows: ReadonlyArray<RawEvLocation>,
): EvChargingLocation[] =>
  rows.flatMap((row) => {
    const lat = row.latitude;
    const lng = row.longtitude ?? row.longitude;
    if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    let available = 0;
    let occupied = 0;
    let total = 0;
    let maxPowerKw: number | null = null;
    let hasDc = false;
    const operators = new Set<string>();
    const plugTypes = new Set<string>();
    for (const point of row.chargingPoints) {
      if (point.operator?.trim()) operators.add(point.operator.trim());
      for (const plug of point.plugTypes) {
        if (plug.plugType?.trim()) plugTypes.add(plug.plugType.trim());
        if (plug.current?.toUpperCase() === "DC") hasDc = true;
        const power = Number(plug.powerRating);
        if (plug.powerRating && Number.isFinite(power) && power > (maxPowerKw ?? 0)) maxPowerKw = power;
        for (const charger of plug.evIds) {
          total += 1;
          if (charger.status === EV_AVAILABLE) available += 1;
          else if (charger.status === EV_OCCUPIED) occupied += 1;
        }
      }
    }
    const id = createHash("sha256").update(`${row.name}|${row.address}|${lat}|${lng}`).digest("hex").slice(0, 16);
    return [{
      id,
      name: row.name.trim(),
      address: row.address.trim(),
      lat,
      lng,
      available,
      occupied,
      total,
      maxPowerKw,
      hasDc,
      operators: [...operators],
      plugTypes: [...plugTypes],
    }];
  });

export const getEvChargingLocations = (): Effect.Effect<
  EvChargingLocation[],
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "ev-charging-locations",
      EV_CHARGERS_CACHE_TTL_MS,
      Effect.gen(function* () {
        const batch = yield* ltaGet("/EVCBatch", LtaEvcBatchResponseSchema);
        const link = batch.value[0]?.Link;
        if (!link || !SAFE_EV_BATCH_URL_RE.test(link)) {
          return yield* Effect.fail(
            new ExternalApiError({
              service: "lta",
              status: 502,
              message: "EVCBatch did not return a trusted snapshot link",
            }),
          );
        }
        // The presigned link carries its own auth; never forward AccountKey.
        const file = yield* httpGetJson(
          "lta-ev-batch",
          link,
          { Accept: "application/json" },
          LtaEvBatchFileSchema,
          EV_BATCH_FILE_TIMEOUT_MS,
        );
        return normalizeEvChargingLocations(file.evLocationsData);
      }),
    );
  });
