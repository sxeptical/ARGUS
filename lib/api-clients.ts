/**
 * External API clients for the ARGUS server. Every function in this file
 * returns an `Effect` that yields a domain object and fails with one of the
 * `AppError` tags declared in `@/lib/errors`.
 *
 * Caching is provided by the `Cache` service from `@/lib/cache`; timeouts
 * are applied via `Effect.timeout`; HTTP is performed by the `HttpClient`
 * from `@effect/platform` (backed by `FetchHttpClient`, which uses
 * `globalThis.fetch`).
 *
 * The route handlers in the app/api/{route}.ts files execute these Effects
 * through the shared 'runtime' exported from '@/lib/effect-runtime'.
 */
import { HttpClient } from "@effect/platform";
import { Schema } from "@effect/schema";
import { Duration, Effect } from "effect";
import { Cache } from "@/lib/cache";
import {
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
  fromParseError,
  fromTimeoutException,
} from "@/lib/errors";
import {
  AviationStackResponseSchema,
  BusStopSchema,
  DataGovForecastResponseSchema,
  DataGovHumidityResponseSchema,
  DataGovPsiResponseSchema,
  DataGovTemperatureResponseSchema,
  LtaBusArrivalsResponseSchema,
  LtaBusStopsResponseSchema,
  LtaTrafficImagesResponseSchema,
  OpenSkyResponseSchema,
} from "@/types/schemas";
import type {
  BusArrival,
  BusStop,
  FlightDirection,
  FlightState,
  NewsItem,
  TrafficCamera,
  WeatherData,
} from "@/types";

// Re-export so legacy import paths keep working until the route handlers are
// migrated to '@/lib/errors' in tasks 6.x and 7.x.
export { ExternalApiError };

const LTA_BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice";
const DATA_GOV_BASE_URL = "https://api.data.gov.sg/v1/environment";
const AVIATIONSTACK_BASE_URL = "https://api.aviationstack.com/v1";
const OPENSKY_BASE_URL = "https://opensky-network.org/api";
const FLIGHT_TIMEOUT_MS = 6_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RSS_BYTES = 512 * 1024; // 512 KB
const FLIGHTS_FALLBACK_KEY = "flights-sg-fallback";
const FLIGHTS_FALLBACK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const SAFE_CAMERA_IMAGE_URL_RE =
  /^https:\/\/(?:images\.data\.gov\.sg|datamall2\.mytransport\.sg|dm-traffic-camera-itsc\.s3\.ap-southeast-1\.amazonaws\.com)\//i;
const SAFE_URL_RE = /^https?:\/\//i;
const SG_BOUNDS = {
  lamin: 1.15,
  lomin: 103.45,
  lamax: 1.5,
  lomax: 104.15,
};
const CHANGI_COORDS = { lat: 1.3644, lon: 103.9915 };
const SG_AIRPORT_ICAO = new Set(["WSSS", "WSSL"]);
const SG_AIRPORT_IATA = new Set(["SIN", "XSP"]);

// ---------- Shared HTTP helpers ----------

const withTimeout = <A, E, R>(
  service: string,
  effect: Effect.Effect<A, E, R>,
  ms: number,
): Effect.Effect<A, E | TimeoutError, R> =>
  effect.pipe(
    Effect.timeout(Duration.millis(ms)),
    Effect.catchTag("TimeoutException", (cause) =>
      Effect.fail(
        fromTimeoutException(service, cause) as TimeoutError,
      ),
    ),
  );

// Internal helper: a single typed HTTP GET that returns the decoded JSON.
// Schemas are passed as `any` to avoid Effect's complex Schema generic
// machinery; callers cast the result back to the expected shape.
const httpGetJson = (
  service: string,
  url: string,
  headers: Record<string, string>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decode: any,
  timeoutMs: number,
): Effect.Effect<
  unknown,
  ExternalApiError | SchemaParseError | TimeoutError,
  HttpClient.HttpClient
> => {
  // Apply the shared timeout, then map transport-level failures
  // (HttpClientError, request aborts) into ExternalApiError. The timeout
  // and the transport-error mapping share the same `catchAll` because we
  // need both to flow into the typed-error channel.
  const request = HttpClient.get(url, { headers }).pipe(
    Effect.timeout(Duration.millis(timeoutMs)),
  );

  const response = request.pipe(
    Effect.catchTag("TimeoutException", (cause) =>
      Effect.fail(fromTimeoutException(service, cause) as TimeoutError),
    ),
    Effect.catchAll((e) =>
      Effect.fail(
        new ExternalApiError({
          service,
          status: 502,
          message:
            e instanceof Error
              ? e.message
              : `${service} request failed: ${String(e)}`,
        }),
      ),
    ),
  );

  return Effect.gen(function* () {
    const ok = yield* response;

    if (ok.status === 404) {
      return yield* Effect.fail(
        new ExternalApiError({
          service,
          status: 404,
          message: `${service} returned 404`,
        }),
      );
    }

    if (ok.status < 200 || ok.status >= 300) {
      return yield* Effect.fail(
        new ExternalApiError({
          service,
          status: ok.status,
          message: `${service} request failed (${ok.status})`,
        }),
      );
    }

    // `HttpClientResponse.schemaJson` wraps the body in
    // `{ status, headers, body }` before decoding, which is the wrong shape
    // for the LTA / Data.gov.sg / Aviationstack / OpenSky payloads. Read the
    // body with `.json` and decode it directly with our Schema instead.
    const body = yield* ok.json;
    return yield* Schema.decodeUnknown(decode)(body).pipe(
      Effect.mapError((cause) => fromParseError(service, cause)),
    );
  }) as Effect.Effect<
    unknown,
    ExternalApiError | SchemaParseError | TimeoutError,
    HttpClient.HttpClient
  >;
};

const getLtaApiKey = (): Effect.Effect<string, ExternalApiError, never> =>
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

const getAviationStackApiKey = (): Effect.Effect<string, ExternalApiError, never> =>
  Effect.gen(function* () {
    const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
    if (!apiKey) {
      return yield* Effect.fail(
        new ExternalApiError({
          service: "aviationstack",
          message: "Missing AVIATIONSTACK_API_KEY",
          status: 401,
        }),
      );
    }
    return apiKey;
  });

// ---------- LTA ----------

 
const ltaGet = <A>(
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decode: any,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Effect.Effect<
  A,
  ExternalApiError | SchemaParseError | TimeoutError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const apiKey = yield* getLtaApiKey();
    return (yield* httpGetJson(
      "lta",
      `${LTA_BASE_URL}${endpoint}`,
      { AccountKey: apiKey, Accept: "application/json" },
      decode,
      timeoutMs,
    )) as A;
  });

export const getBusStops = (): Effect.Effect<
  BusStop[],
  ExternalApiError | SchemaParseError | TimeoutError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "bus-stops",
      24 * 60 * 60 * 1000,
      Effect.gen(function* () {
        const allStops: BusStop[] = [];
        const MAX_PAGES = 20;
        for (let pages = 0, skip = 0; pages < MAX_PAGES; pages += 1) {
          const page = yield* ltaGet<{
            readonly value: ReadonlyArray<BusStop>;
          }>(`/BusStops?$skip=${skip}`, LtaBusStopsResponseSchema).pipe(
            Effect.catchTag("ExternalApiError", (e) =>
              e.status === 404
                ? Effect.succeed(null)
                : Effect.fail(e),
            ),
          );
          if (!page || !Array.isArray(page.value)) break;
          allStops.push(...page.value);
          if (page.value.length < 500) break;
          skip += 500;
        }
        return yield* Schema.decodeUnknown(Schema.Array(BusStopSchema))(
          allStops,
        ).pipe(
          Effect.mapError((cause) => fromParseError("lta", cause)),
          Effect.map((arr) => arr.slice() as BusStop[]),
        );
      }),
    );
  });

export const getBusArrivals = (
  stopId: string,
): Effect.Effect<
  BusArrival[],
  ExternalApiError | SchemaParseError | TimeoutError,
  Cache | HttpClient.HttpClient
> => {
  // `stopId` is validated by the route handler (see `BUS_STOP_ID_RE` in
  // `@/lib/route-utils`). The LTA endpoint itself accepts a wider range
  // than 5 digits, so we pass it through unchanged here.
  const ttl = 15_000;
  return Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      `bus-arrivals-${stopId}`,
      ttl,
      Effect.gen(function* () {
        // The v3 endpoint is canonical. It returns `Services: []` for stops
        // with no live arrivals — that is a valid, successful response,
        // not an error. The v2 endpoint was the legacy shape; LTA removed
        // it, so it is kept here as a best-effort fallback that swallows
        // both `ExternalApiError` 404 and `SchemaParseError` (the v2
        // endpoint now returns plain text which fails JSON decoding).
        const v3 = yield* ltaGet<{
          readonly Services: ReadonlyArray<BusArrival>;
        }>(`/v3/BusArrival?BusStopCode=${encodeURIComponent(stopId)}`, LtaBusArrivalsResponseSchema);

        if (v3.Services.length > 0) {
          return v3.Services.slice() as BusArrival[];
        }

        return yield* ltaGet<{
          readonly Services: ReadonlyArray<BusArrival>;
        }>(`/BusArrivalv2?BusStopCode=${encodeURIComponent(stopId)}`, LtaBusArrivalsResponseSchema).pipe(
          Effect.map((r) => r.Services.slice() as BusArrival[]),
          Effect.catchAll(() => Effect.succeed<BusArrival[]>([])),
        );
      }),
    );
  });
};

export const getTrafficCameras = (): Effect.Effect<
  TrafficCamera[],
  ExternalApiError | SchemaParseError | TimeoutError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "traffic-cameras",
      60 * 1000,
      Effect.gen(function* () {
        const payload = yield* ltaGet<{
          readonly value: ReadonlyArray<unknown>;
        }>("/Traffic-Imagesv2", LtaTrafficImagesResponseSchema).pipe(
          Effect.catchTag("ExternalApiError", (e) =>
            e.status === 404
              ? Effect.succeed({ value: [] as ReadonlyArray<unknown> })
              : Effect.fail(e),
          ),
        );

        const value: unknown[] = (payload as { value: unknown[] }).value ?? [];
        const first = value[0] as { Cameras?: unknown } | undefined;
        const flat: RawTrafficImage[] =
          Array.isArray(value) && value.length > 0 && first && "Cameras" in first
            ? (value as Array<{ Cameras: RawTrafficImage[] }>).flatMap(
                (entry) => entry.Cameras,
              )
            : (value as RawTrafficImage[]);

        return flat
          .filter(
            (camera) =>
              typeof camera.CameraID === "string" &&
              Number.isFinite(camera.Latitude) &&
              Number.isFinite(camera.Longitude) &&
              SAFE_CAMERA_IMAGE_URL_RE.test(camera.ImageLink),
          )
          .map((camera) => ({
            ...camera,
            location: `Camera ${camera.CameraID}`,
          }));
      }),
    );
  });

// ---------- Weather ----------

const getPsiStatus = (psi: number | null): WeatherData["psiStatus"] => {
  if (psi === null) return "Unknown";
  if (psi <= 50) return "Good";
  if (psi <= 100) return "Moderate";
  return "Unhealthy";
};

const average = (values: number[]): number | null => {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return null;
  return Math.round(
    finiteValues.reduce((acc, item) => acc + item, 0) / finiteValues.length,
  );
};

type RegionalReading = Partial<
  Record<"national" | "north" | "east" | "west" | "central" | "south", number>
>;

const nationalOrMaxRegional = (
  readings: RegionalReading | undefined,
): number | null => {
  if (!readings) return null;
  if (Number.isFinite(readings.national)) return readings.national as number;
  const regionalValues = [
    readings.north,
    readings.east,
    readings.west,
    readings.central,
    readings.south,
  ].filter((value): value is number => Number.isFinite(value));
  if (regionalValues.length === 0) return null;
  return Math.max(...regionalValues);
};

const latestIsoTimestamp = (values: Array<string | undefined>): string => {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
};

 
const dataGovGet = <A>(
  endpoint: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  decode: any,
): Effect.Effect<
  A,
  ExternalApiError | SchemaParseError | TimeoutError,
  HttpClient.HttpClient
> =>
  httpGetJson(
    "data.gov.sg",
    `${DATA_GOV_BASE_URL}${endpoint}`,
    { Accept: "application/json" },
    decode,
    DEFAULT_TIMEOUT_MS,
  ) as Effect.Effect<
    A,
    ExternalApiError | SchemaParseError | TimeoutError,
    HttpClient.HttpClient
  >;

export const getWeather = (): Effect.Effect<
  WeatherData,
  ExternalApiError | SchemaParseError | TimeoutError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "weather",
      5 * 60 * 1000,
      Effect.gen(function* () {
        const results = yield* Effect.all(
          [
            dataGovGet<{
              readonly area_metadata?: ReadonlyArray<{ name: string }>;
              readonly items?: ReadonlyArray<{
                timestamp?: string;
                update_timestamp?: string;
                forecasts?: ReadonlyArray<{ area: string; forecast: string }>;
              }>;
            }>("/2-hour-weather-forecast", DataGovForecastResponseSchema),
            dataGovGet<{
              readonly items?: ReadonlyArray<{
                timestamp?: string;
                update_timestamp?: string;
                readings?: {
                  psi_twenty_four_hourly?: RegionalReading;
                };
              }>;
            }>("/psi", DataGovPsiResponseSchema),
            dataGovGet<{
              readonly items?: ReadonlyArray<{
                timestamp?: string;
                update_timestamp?: string;
                readings?: ReadonlyArray<{ value: number }>;
              }>;
            }>("/air-temperature", DataGovTemperatureResponseSchema),
            dataGovGet<{
              readonly items?: ReadonlyArray<{
                timestamp?: string;
                update_timestamp?: string;
                readings?: ReadonlyArray<{ value: number }>;
              }>;
            }>("/relative-humidity", DataGovHumidityResponseSchema),
          ],
          { concurrency: "unbounded" },
        );

        const [forecast, psi, temperature, humidity] = results as [
          {
            readonly area_metadata?: ReadonlyArray<{ name: string }>;
            readonly items?: ReadonlyArray<{
              timestamp?: string;
              update_timestamp?: string;
              forecasts?: ReadonlyArray<{ area: string; forecast: string }>;
            }>;
          },
          {
            readonly items?: ReadonlyArray<{
              timestamp?: string;
              update_timestamp?: string;
              readings?: {
                psi_twenty_four_hourly?: RegionalReading;
              };
            }>;
          },
          {
            readonly items?: ReadonlyArray<{
              timestamp?: string;
              update_timestamp?: string;
              readings?: ReadonlyArray<{ value: number }>;
            }>;
          },
          {
            readonly items?: ReadonlyArray<{
              timestamp?: string;
              update_timestamp?: string;
              readings?: ReadonlyArray<{ value: number }>;
            }>;
          },
        ];

        const area = forecast.area_metadata?.[0]?.name ?? "Singapore";
        const forecastText =
          forecast.items?.[0]?.forecasts?.find(
            (entry) => entry.area === area,
          )?.forecast ?? "No forecast available";

        const psiValue = nationalOrMaxRegional(
          psi.items?.[0]?.readings?.psi_twenty_four_hourly,
        );

        const temperatureReadings =
          temperature.items?.[0]?.readings?.map((entry) => entry.value) ?? [];
        const humidityReadings =
          humidity.items?.[0]?.readings?.map((entry) => entry.value) ?? [];

        return {
          temperature: average(temperatureReadings),
          humidity: average(humidityReadings),
          psi: psiValue,
          psiStatus: getPsiStatus(psiValue),
          forecast: forecastText,
          lastUpdated: latestIsoTimestamp([
            forecast.items?.[0]?.update_timestamp,
            forecast.items?.[0]?.timestamp,
            psi.items?.[0]?.update_timestamp,
            psi.items?.[0]?.timestamp,
            temperature.items?.[0]?.update_timestamp,
            temperature.items?.[0]?.timestamp,
            humidity.items?.[0]?.update_timestamp,
            humidity.items?.[0]?.timestamp,
          ]),
        };
      }),
    );
  });

// ---------- News (RSS) ----------

const rssFeeds: ReadonlyArray<{ readonly source: string; readonly url: string }> = [
  {
    source: "The Straits Times",
    url: "https://www.straitstimes.com/news/singapore/rss.xml",
  },
  {
    source: "CNA",
    url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",
  },
];

const extractRssTag = (xml: string, tag: string): string => {
  const match = xml.match(
    new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"),
  );
  if (!match?.[1]) return "";
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
};

const toIsoDate = (value: string): string => {
  const timestamp = value ? Date.parse(value) : Date.now();
  return new Date(Number.isFinite(timestamp) ? timestamp : Date.now()).toISOString();
};

const parseRssItems = (xml: string, source: string): NewsItem[] => {
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
  return itemMatches
    .map((rawItem) => {
      const title = extractRssTag(rawItem, "title");
      const link = extractRssTag(rawItem, "link");
      const publishedAt = extractRssTag(rawItem, "pubDate");

      if (!title || !link) return null;
      if (!SAFE_URL_RE.test(link)) return null;

      return {
        title,
        source,
        url: link,
        publishedAt: toIsoDate(publishedAt),
      } satisfies NewsItem;
    })
    .filter((item): item is NewsItem => item !== null);
};

const fetchRssFeed = (
  source: string,
  url: string,
): Effect.Effect<NewsItem[], never, never> =>
  Effect.gen(function* () {
    const response = yield* withTimeout(
      "rss",
      Effect.tryPromise({
        try: () =>
          fetch(url, { cache: "no-store" }).then((r) => r),
        catch: () => new Error("rss fetch failed"),
      }),
      DEFAULT_TIMEOUT_MS,
    ).pipe(Effect.option);

    if (response._tag === "None") return [];

    const res = response.value;
    if (!res.ok) return [];
    const contentLength = res.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_RSS_BYTES) return [];
    const xml = yield* Effect.tryPromise({
      try: () => res.text(),
      catch: () => new Error("rss body read failed"),
    }).pipe(Effect.option);
    if (xml._tag === "None") return [];
    if (xml.value.length > MAX_RSS_BYTES) return [];
    return parseRssItems(xml.value, source);
  });

export const getNews = (): Effect.Effect<NewsItem[], never, Cache> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "news",
      15 * 60 * 1000,
      Effect.gen(function* () {
        const rssResults = yield* Effect.all(
          rssFeeds.map(({ source, url }) => fetchRssFeed(source, url)),
          { concurrency: 2 },
        );
        const merged = rssResults.flat();
        if (merged.length > 0) {
          return merged
            .sort(
              (a, b) =>
                +new Date(b.publishedAt) - +new Date(a.publishedAt),
            )
            .slice(0, 20);
        }
        return [
          {
            title: "News feeds are currently unavailable",
            source: "System",
            url: "#",
            publishedAt: new Date().toISOString(),
          },
        ];
      }),
    );
  });

// ---------- Flights ----------

const bearingDegrees = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number => {
  const fromLatRad = (fromLat * Math.PI) / 180;
  const fromLonRad = (fromLon * Math.PI) / 180;
  const toLatRad = (toLat * Math.PI) / 180;
  const toLonRad = (toLon * Math.PI) / 180;

  const dLon = toLonRad - fromLonRad;
  const y = Math.sin(dLon) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
};

const classifyFlightDirection = (
  latitude: number,
  longitude: number,
  track: number | null,
): FlightDirection => {
  if (track === null) return "transit";
  const headingToChangi = bearingDegrees(
    latitude,
    longitude,
    CHANGI_COORDS.lat,
    CHANGI_COORDS.lon,
  );
  const diff = Math.abs(track - headingToChangi);
  const normalized = diff > 180 ? 360 - diff : diff;
  if (normalized <= 55) return "inbound";
  if (normalized >= 125) return "outbound";
  return "transit";
};

const normalizeCode = (code?: string | null): string =>
  (code ?? "").trim().toUpperCase();

const isSingaporeAirport = (
  icao?: string | null,
  iata?: string | null,
): boolean =>
  SG_AIRPORT_ICAO.has(normalizeCode(icao)) ||
  SG_AIRPORT_IATA.has(normalizeCode(iata));

type RawTrafficImage = {
  CameraID: string;
  Latitude: number;
  Longitude: number;
  ImageLink: string;
};

type AviationStackLive = {
  updated?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  altitude?: number | null;
  direction?: number | null;
  speed_horizontal?: number | null;
  speed_vertical?: number | null;
  is_ground?: boolean | null;
};

type AviationStackItem = {
  departure?: {
    airport?: string | null;
    icao?: string | null;
    iata?: string | null;
  } | null;
  arrival?: {
    icao?: string | null;
    iata?: string | null;
  } | null;
  airline?: { name?: string | null; iata?: string | null } | null;
  flight?: {
    number?: string | null;
    iata?: string | null;
    icao?: string | null;
  } | null;
  aircraft?: {
    registration?: string | null;
    icao24?: string | null;
  } | null;
  live?: AviationStackLive | null;
};

const toFlightStateFromAviationStack = (
  item: unknown,
): FlightState | null => {
  const it = item as AviationStackItem;
  const live = it?.live;
  const latitude = live?.latitude;
  const longitude = live?.longitude;
  const onGround = live?.is_ground ?? false;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || onGround) {
    return null;
  }

  const flightLatitude = latitude as number;
  const flightLongitude = longitude as number;
  const flightTrack = Number.isFinite(live?.direction)
    ? (live?.direction as number)
    : null;

  const dep = it?.departure;
  const arr = it?.arrival;
  const depIsSingapore = isSingaporeAirport(dep?.icao, dep?.iata);
  const arrIsSingapore = isSingaporeAirport(arr?.icao, arr?.iata);
  const direction: FlightDirection =
    arrIsSingapore && !depIsSingapore
      ? "inbound"
      : depIsSingapore && !arrIsSingapore
        ? "outbound"
        : classifyFlightDirection(flightLatitude, flightLongitude, flightTrack);

  const flight = it?.flight;
  const airline = it?.airline;
  const aircraft = it?.aircraft;

  const flightCode =
    flight?.icao?.trim() ||
    flight?.iata?.trim() ||
    `${airline?.iata?.trim() ?? ""}${flight?.number?.trim() ?? ""}`.trim();
  const icao24 =
    aircraft?.icao24?.trim() ||
    aircraft?.registration?.trim() ||
    flightCode ||
    "unknown";
  const callsign = flightCode || icao24.toUpperCase();

  const velocityKmh = live?.speed_horizontal;
  const verticalKmh = live?.speed_vertical;
  const velocity = Number.isFinite(velocityKmh)
    ? (velocityKmh as number) / 3.6
    : null;
  const verticalRate = Number.isFinite(verticalKmh)
    ? (verticalKmh as number) / 3.6
    : null;
  const altitude = Number.isFinite(live?.altitude)
    ? (live?.altitude as number)
    : null;
  const lastContactMs = live?.updated ? Date.parse(live.updated) : Number.NaN;
  const lastContact = Number.isFinite(lastContactMs)
    ? Math.floor(lastContactMs / 1000)
    : null;

  return {
    id: `${callsign}-${lastContact ?? 0}`,
    icao24,
    callsign,
    originCountry:
      it?.departure?.airport?.trim() || airline?.name?.trim() || "Unknown",
    latitude: flightLatitude,
    longitude: flightLongitude,
    altitude,
    velocity,
    track: flightTrack,
    verticalRate,
    onGround,
    direction,
    lastContact,
  };
};

const toFlightStateFromOpenSky = (
  row: readonly unknown[],
): FlightState | null => {
  const icao24 = (row[0] as string | null)?.trim() ?? "";
  const callsign = (row[1] as string | null)?.trim() ?? "";
  const originCountry = (row[2] as string | null)?.trim() ?? "Unknown";
  const longitude = row[5] as number | null;
  const latitude = row[6] as number | null;
  const altitude = row[7] as number | null;
  const onGround = (row[8] as boolean | null) ?? false;
  const velocity = row[9] as number | null;
  const track = row[10] as number | null;
  const verticalRate = row[11] as number | null;
  const lastContact = row[4] as number | null;

  if (
    !icao24 ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    onGround
  ) {
    return null;
  }

  const flightLatitude = latitude as number;
  const flightLongitude = longitude as number;
  const flightTrack = Number.isFinite(track) ? track : null;
  const direction = classifyFlightDirection(
    flightLatitude,
    flightLongitude,
    flightTrack,
  );

  return {
    id: callsign || icao24,
    icao24,
    callsign: callsign || "UNKN",
    originCountry,
    latitude: flightLatitude,
    longitude: flightLongitude,
    altitude: Number.isFinite(altitude) ? altitude : null,
    velocity: Number.isFinite(velocity) ? velocity : null,
    track: flightTrack,
    verticalRate: Number.isFinite(verticalRate) ? verticalRate : null,
    onGround,
    direction,
    lastContact: Number.isFinite(lastContact) ? lastContact : null,
  };
};

const fetchFlightsFromAviationStack = (): Effect.Effect<
  FlightState[],
  ExternalApiError | SchemaParseError | TimeoutError,
  HttpClient.HttpClient
> => {
  type AviationStackResponse = {
    data?: ReadonlyArray<unknown>;
    error?: {
      code?: string | number;
      type?: string;
      info?: string;
    };
  };

  const program = Effect.gen(function* () {
    const apiKey = yield* getAviationStackApiKey();
    const endpoints = [
      { dep_icao: "WSSS" },
      { arr_icao: "WSSS" },
      { dep_icao: "WSSL" },
      { arr_icao: "WSSL" },
    ] as const;

    // Each query catches its own failure and returns an empty array. The
    // outer `Effect.all` always succeeds. The caller decides whether the
    // merged result is empty and falls back accordingly.
    const batches: ReadonlyArray<ReadonlyArray<unknown>> = yield* Effect.all(
      endpoints.map((filter) =>
        Effect.gen(function* () {
          const params = new URLSearchParams({
            access_key: apiKey,
            limit: "100",
            ...filter,
          });
          const response = (yield* httpGetJson(
            "aviationstack",
            `${AVIATIONSTACK_BASE_URL}/flights?${params.toString()}`,
            { Accept: "application/json" },
            AviationStackResponseSchema,
            FLIGHT_TIMEOUT_MS,
          )) as AviationStackResponse;
          if (response.error) {
            return yield* Effect.fail(
              new ExternalApiError({
                service: "aviationstack",
                message: `Aviationstack error${response.error.code ? ` ${response.error.code}` : ""}: ${response.error.info ?? response.error.type ?? "unknown"}`,
                status: 502,
              }),
            );
          }
          return response.data ?? [];
        }).pipe(
          Effect.catchAll(() => Effect.succeed<readonly unknown[]>([])),
        ),
      ),
      { concurrency: "unbounded" },
    );

    const deduped = new globalThis.Map<string, FlightState>();
    for (const batch of batches) {
      for (const item of batch) {
        const flight = toFlightStateFromAviationStack(item);
        if (!flight) continue;
        const existing = deduped.get(flight.icao24);
        const existingTs = existing?.lastContact ?? 0;
        const currentTs = flight.lastContact ?? 0;
        if (!existing || currentTs >= existingTs) {
          deduped.set(flight.icao24, flight);
        }
      }
    }

    return Array.from(deduped.values());
  });

  return program as Effect.Effect<
    FlightState[],
    ExternalApiError | SchemaParseError | TimeoutError,
    HttpClient.HttpClient
  >;
};

const fetchFlightsFromOpenSky = (): Effect.Effect<
  FlightState[],
  ExternalApiError | SchemaParseError | TimeoutError,
  HttpClient.HttpClient
> => {
  const params = new URLSearchParams({
    lamin: String(SG_BOUNDS.lamin),
    lomin: String(SG_BOUNDS.lomin),
    lamax: String(SG_BOUNDS.lamax),
    lomax: String(SG_BOUNDS.lomax),
  });
  const program = Effect.gen(function* () {
    type OpenSkyResponse = {
      time: number;
      states: ReadonlyArray<readonly unknown[]> | null;
    };
    const response = (yield* httpGetJson(
      "opensky",
      `${OPENSKY_BASE_URL}/states/all?${params.toString()}`,
      { Accept: "application/json" },
      OpenSkyResponseSchema,
      FLIGHT_TIMEOUT_MS,
    ).pipe(
      Effect.catchTag("ExternalApiError", (e) =>
        e.status === 404
          ? Effect.succeed({ time: 0, states: null } as never)
          : Effect.fail(e),
      ),
    )) as OpenSkyResponse;

    const states = response.states ?? [];
    return states
      .map((row) => toFlightStateFromOpenSky(row))
      .filter((flight): flight is FlightState => flight !== null);
  });

  return program as Effect.Effect<
    FlightState[],
    ExternalApiError | SchemaParseError | TimeoutError,
    HttpClient.HttpClient
  >;
};

export const getFlights = (): Effect.Effect<
  FlightState[],
  ExternalApiError | SchemaParseError | TimeoutError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "flights-sg",
      15_000,
      Effect.gen(function* () {
        // Only swallow `ExternalApiError` (an upstream provider returned a
        // usable but empty result, e.g. 404). `TimeoutError` and
        // `SchemaParseError` propagate so the route can return 502/504.
        const primary = yield* fetchFlightsFromAviationStack().pipe(
          Effect.catchTag("ExternalApiError", () =>
            Effect.succeed<FlightState[]>([]),
          ),
        );
        let flights: FlightState[] = primary;

        if (flights.length === 0) {
          const fallback = yield* fetchFlightsFromOpenSky().pipe(
            Effect.catchTag("ExternalApiError", () =>
              Effect.succeed<FlightState[]>([]),
            ),
          );
          flights = fallback;
        }

        const sorted = flights
          .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
          .slice(0, 120);

        if (sorted.length > 0) {
          yield* cache.set(FLIGHTS_FALLBACK_KEY, sorted);
          return sorted;
        }

        // Last-good snapshot. Wrap the inner cache call so its own
        // in-flight de-dup does not starve other concurrent flight polls.
        return yield* cache.get(
          FLIGHTS_FALLBACK_KEY,
          FLIGHTS_FALLBACK_MAX_AGE_MS,
          Effect.succeed<FlightState[]>([]),
        );
      }),
    );
  });
