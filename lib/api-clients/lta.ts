/**
 * LTA DataMall clients: bus stops, bus arrivals, traffic cameras, train
 * service alerts, carpark availability, and EV charging points.
 */
import { createHash } from "node:crypto";
import type { z } from "zod";
import { cache } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
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
const BUS_STOPS_TIMEOUT_MS = 35_000;
const BUS_STOPS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Camera images must come from one of the known LTA hosts. */
const SAFE_CAMERA_IMAGE_URL_RE =
  /^https:\/\/(?:images\.data\.gov\.sg|datamall2\.mytransport\.sg|dm-traffic-camera-itsc\.s3\.ap-southeast-1\.amazonaws\.com)\//i;
/** The EV batch link must point at LTA's dataset bucket before we follow it. */
const SAFE_EV_BATCH_URL_RE =
  /^https:\/\/dmprod-datasets\.s3\.ap-southeast-1\.amazonaws\.com\//i;

const getLtaApiKey = (): string => {
  const apiKey = process.env.LTA_API_KEY?.trim();
  if (!apiKey || apiKey.toLowerCase().includes("your_lta_datamall_key")) {
    throw new ExternalApiError({
      service: "lta",
      message: "Missing or placeholder LTA_API_KEY",
      status: 401,
    });
  }
  return apiKey;
};

/** Authenticated GET against the LTA OData base URL, schema-validated. */
const ltaGet = async <A>(
  endpoint: string,
  schema: z.ZodType<A>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<A> =>
  httpGetJson(
    "lta",
    `${LTA_BASE_URL}${endpoint}`,
    { AccountKey: getLtaApiKey(), Accept: "application/json" },
    schema,
    timeoutMs,
  );

/** A 404 from an LTA endpoint means "nothing here", not an outage. */
const nullOn404 = (error: unknown): null => {
  if (error instanceof ExternalApiError && error.status === 404) return null;
  throw error;
};

type LtaPage<T> = { readonly value: ReadonlyArray<T> } | null;

/**
 * Fetch concurrent OData pages until a short or empty page. Fail at the page
 * cap rather than return a truncated dataset.
 */
export const collectLtaPages = async <A>(
  fetchPage: (skip: number) => Promise<LtaPage<A>>,
  options: {
    readonly pageSize: number;
    readonly maxPages: number;
    readonly service: string;
    readonly concurrency?: number;
  },
): Promise<A[]> => {
  const { pageSize, maxPages, service } = options;
  const concurrency = Math.max(1, options.concurrency ?? 1);
  const allRows: A[] = [];
  let pagesProcessed = 0;
  let reachedEnd = false;

  while (pagesProcessed < maxPages && !reachedEnd) {
    const batchSize = Math.min(concurrency, maxPages - pagesProcessed);
    const batch = await Promise.all(
      Array.from({ length: batchSize }, (_, i) =>
        fetchPage((pagesProcessed + i) * pageSize),
      ),
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

  if (!reachedEnd) {
    throw new ExternalApiError({
      service,
      status: 502,
      message: `${service} pagination hit the ${maxPages}-page safety cap without an end marker; refusing to use a truncated dataset`,
    });
  }

  return allRows;
};

export const collectLtaEndpoint = <A>(
  endpoint: string,
  schema: z.ZodType<{ value: A[] }>,
  options: {
    readonly pageSize: number;
    readonly maxPages: number;
    readonly concurrency?: number;
  },
): Promise<A[]> =>
  collectLtaPages(
    (skip) => ltaGet(`${endpoint}?$skip=${skip}`, schema).catch(nullOn404),
    { ...options, service: "lta" },
  );

export const getBusStops = (): Promise<BusStop[]> =>
  cache.get("bus-stops", BUS_STOPS_CACHE_TTL_MS, () =>
    // Aggregate timeout across the whole multi-page walk.
    withTimeout("lta-bus-stops", BUS_STOPS_TIMEOUT_MS, () =>
      collectLtaEndpoint("/BusStops", LtaBusStopsResponseSchema, {
        pageSize: 500,
        maxPages: 20,
        concurrency: 4,
      }),
    ),
  );

// `stopId` is validated by the route handler (see `BUS_STOP_ID_RE` in
// `@/lib/route-utils`). The v3 endpoint returns `Services: []` for stops with
// no live arrivals: a valid, successful response, not an error.
export const getBusArrivals = (stopId: string): Promise<BusArrival[]> =>
  cache.get(`bus-arrivals-${stopId}`, 15_000, async () => {
    const response = await ltaGet(
      `/v3/BusArrival?BusStopCode=${encodeURIComponent(stopId)}`,
      LtaBusArrivalsResponseSchema,
    );
    return response.Services;
  });

export const getTrafficCameras = (): Promise<TrafficCamera[]> =>
  cache.get("traffic-cameras", 60 * 1000, async () => {
    const payload = await ltaGet(
      "/Traffic-Imagesv2",
      LtaTrafficImagesResponseSchema,
    ).catch(nullOn404);

    // The endpoint returns one of two shapes depending on the upstream
    // wrapper version; both are schema-validated, normalize here.
    const flat: RawTrafficImage[] = (payload?.value ?? []).flatMap((entry) =>
      "Cameras" in entry ? entry.Cameras : [entry],
    );

    return flat
      .filter(
        (camera) =>
          Number.isFinite(camera.Latitude) &&
          Number.isFinite(camera.Longitude) &&
          SAFE_CAMERA_IMAGE_URL_RE.test(camera.ImageLink),
      )
      .map((camera) => ({ ...camera, location: `Camera ${camera.CameraID}` }));
  });

export const getTrafficIncidents = (): Promise<TrafficIncident[]> =>
  cache.get("incidents", 60_000, async () => {
    const payload = await ltaGet(
      "/TrafficIncidents",
      LtaTrafficIncidentsResponseSchema,
    );
    return normalizeTrafficIncidents(payload.value);
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

/** LTA documents `Stations` as "NE9,NE8"; arrays are accepted as well. */
const parseStationCodes = (
  stations: string | readonly string[] | null | undefined,
): string[] =>
  (typeof stations === "string" ? stations.split(",") : (stations ?? []))
    .map((code) => code.trim())
    .filter(Boolean);

/** Normalize either TrainServiceAlerts wrapper shape. */
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
        segments.flatMap((segment) => parseStationCodes(segment.Stations)),
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

export const getTrainServiceAlerts = (): Promise<TrainServiceAlert[]> =>
  cache.get("train-service-alerts", TRAIN_ALERTS_CACHE_TTL_MS, async () =>
    normalizeTrainServiceAlerts(
      await ltaGet("/TrainServiceAlerts", LtaTrainServiceAlertsResponseSchema),
    ),
  );

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

export const getCarparkAvailability = (): Promise<CarparkAvailability[]> =>
  cache.get("carpark-availability", CARPARKS_CACHE_TTL_MS, () =>
    withTimeout("lta-carparks", CARPARKS_TIMEOUT_MS, async () =>
      normalizeCarparkAvailability(
        await collectLtaPages(
          (skip) =>
            ltaGet(
              `/CarParkAvailabilityv2?$skip=${skip}`,
              LtaCarparkAvailabilityResponseSchema,
            ),
          { pageSize: 500, maxPages: 12, service: "lta", concurrency: 3 },
        ),
      ),
    ),
  );

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

export const getEvChargingLocations = (): Promise<EvChargingLocation[]> =>
  cache.get("ev-charging-locations", EV_CHARGERS_CACHE_TTL_MS, async () => {
    const batch = await ltaGet("/EVCBatch", LtaEvcBatchResponseSchema);
    const link = batch.value[0]?.Link;
    if (!link || !SAFE_EV_BATCH_URL_RE.test(link)) {
      throw new ExternalApiError({
        service: "lta",
        status: 502,
        message: "EVCBatch did not return a trusted snapshot link",
      });
    }
    // The presigned link carries its own auth; never forward AccountKey.
    const file = await httpGetJson(
      "lta-ev-batch",
      link,
      { Accept: "application/json" },
      LtaEvBatchFileSchema,
      EV_BATCH_FILE_TIMEOUT_MS,
    );
    return normalizeEvChargingLocations(file.evLocationsData);
  });
