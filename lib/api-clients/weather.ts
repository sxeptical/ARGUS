/**
 * Aggregates Data.gov.sg weather feeds, including NEA's 24-hr PSI and 1-hr
 * PM2.5 readings, plus lightning and heavy-rain alerts.
 * Endpoints fail independently; the source fails only when all feeds fail.
 */
import type { z } from "zod";
import { cache } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import {
  DataGovForecastAreasResponseSchema,
  DataGovForecastResponseSchema,
  DataGovFourDayResponseSchema,
  DataGovLightningResponseSchema,
  DataGovPm25ResponseSchema,
  DataGovPsiResponseSchema,
  DataGovRainfallResponseSchema,
  DataGovStationReadingsResponseSchema,
  DataGovTwentyFourHourResponseSchema,
  DataGovUvResponseSchema,
} from "@/types/schemas";
import type { AirRegionKey, RegionalAirReadings, WeatherAlerts, WeatherData } from "@/types";
import { getPm25Band, getPsiStatus } from "@/lib/air-quality";
import { buildNextTwoHours, buildRainPeriods } from "@/lib/rain-outlook";
import { FALLBACK_FORECAST_AREAS } from "@/lib/data/forecast-areas";
import {
  LIGHTNING_WINDOW_MS,
  RAIN_LOOKBACK_MS,
  singaporeDate,
  summarizeRain,
  summarizeLightning,
  type ForecastArea,
} from "@/lib/weather-alerts";
import { DEFAULT_TIMEOUT_MS, httpGetJson } from "./http";

const DATA_GOV_BASE_URL = "https://api.data.gov.sg/v1/environment";
const DATA_GOV_V2_BASE_URL = "https://api-open.data.gov.sg/v2/real-time/api";
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
/** Partial results recover quickly, so do not hold gaps for five minutes. */
const WEATHER_PARTIAL_TTL_MS = 30 * 1000;

/** One feed, or null when it fails: feeds are independent. */
const dataGovGet = <A>(
  endpoint: string,
  schema: z.ZodType<A>,
  baseUrl: string = DATA_GOV_BASE_URL,
): Promise<A | null> =>
  httpGetJson(
    "data.gov.sg",
    `${baseUrl}${endpoint}`,
    { Accept: "application/json" },
    schema,
    DEFAULT_TIMEOUT_MS,
  ).catch(() => null);

export const getUvStatus = (uv: number | null): WeatherData["uvStatus"] => {
  if (uv === null || !Number.isFinite(uv)) return "Unknown";
  if (uv <= 2) return "Low";
  if (uv <= 5) return "Moderate";
  if (uv <= 7) return "High";
  if (uv <= 10) return "Very High";
  return "Extreme";
};

const latestRecord = <T extends { timestamp: string }>(
  records: ReadonlyArray<T>,
): T | null => {
  if (records.length === 0) return null;
  return [...records].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  )[0];
};

export const extractLatestUv = (
  response: {
    data: {
      records: ReadonlyArray<{
        timestamp: string;
        index: ReadonlyArray<{ hour: string; value: number }>;
      }>;
    };
  },
): number | null => {
  const record = latestRecord(response.data.records);
  const values = record?.index.filter((entry) => Number.isFinite(entry.value)) ?? [];
  values.sort((a, b) => Date.parse(b.hour) - Date.parse(a.hour));
  return values[0]?.value ?? null;
};

const average = (values: number[]): number | null => {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (finiteValues.length === 0) return null;
  const mean =
    finiteValues.reduce((acc, item) => acc + item, 0) / finiteValues.length;
  // One decimal preserves sensor precision without noisy long floats.
  return Math.round(mean * 10) / 10;
};

type RegionalReading = Partial<
  Record<"national" | "north" | "east" | "west" | "central" | "south", number>
>;

const AIR_REGION_KEYS: ReadonlyArray<AirRegionKey> = [
  "north",
  "south",
  "east",
  "west",
  "central",
];

const finiteOrNull = (value: number | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const buildRegional = (
  readings: RegionalReading | undefined,
): RegionalAirReadings => {
  const result = {} as RegionalAirReadings;
  for (const key of AIR_REGION_KEYS) {
    result[key] = finiteOrNull(readings?.[key]);
  }
  return result;
};

// NEA reports these readings per region; the headline is the worst region,
// falling back to a national reading when no regional values exist.
const worstRegionalOrNational = (
  regions: RegionalAirReadings,
  readings: RegionalReading | undefined,
): number | null => {
  const finite = AIR_REGION_KEYS.map((key) => regions[key]).filter(
    (value): value is number => value !== null,
  );
  if (finite.length > 0) return Math.max(...finite);
  return finiteOrNull(readings?.national);
};

const latestIsoTimestamp = (values: Array<string | undefined>): string => {
  const timestamps: number[] = [];
  for (const value of values) {
    const timestamp = value ? Date.parse(value) : Number.NaN;
    if (Number.isFinite(timestamp)) timestamps.push(timestamp);
  }
  if (timestamps.length === 0) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
};

type CachedWeather = {
  readonly data: WeatherData;
  readonly partial: boolean;
};

export const getWeather = (signal?: AbortSignal): Promise<WeatherData> =>
  cache
    .get<CachedWeather>(
      "weather",
      WEATHER_CACHE_TTL_MS,
      async () => {
        const [
          forecast,
          psi,
          temperature,
          humidity,
          uvResponse,
          pm25Response,
          fourDayResponse,
          twentyFourHourResponse,
        ] = await Promise.all([
          dataGovGet("/2-hour-weather-forecast", DataGovForecastResponseSchema),
          dataGovGet("/psi", DataGovPsiResponseSchema),
          dataGovGet("/air-temperature", DataGovStationReadingsResponseSchema),
          dataGovGet("/relative-humidity", DataGovStationReadingsResponseSchema),
          dataGovGet("/uv", DataGovUvResponseSchema, DATA_GOV_V2_BASE_URL),
          dataGovGet("/pm25", DataGovPm25ResponseSchema, DATA_GOV_V2_BASE_URL),
          dataGovGet(
            "/four-day-outlook",
            DataGovFourDayResponseSchema,
            DATA_GOV_V2_BASE_URL,
          ),
          dataGovGet(
            "/twenty-four-hr-forecast",
            DataGovTwentyFourHourResponseSchema,
            DATA_GOV_V2_BASE_URL,
          ),
        ]);

        const feeds = [
          forecast,
          psi,
          temperature,
          humidity,
          uvResponse,
          pm25Response,
          fourDayResponse,
          twentyFourHourResponse,
        ];
        if (feeds.every((feed) => feed === null)) {
          throw new ExternalApiError({
            service: "data.gov.sg",
            status: 502,
            message: "All weather endpoints failed",
          });
        }

        // Any missing feed makes this a partial snapshot: cache it briefly so
        // the next request retries the gap instead of waiting five minutes.
        const partial = feeds.some((feed) => feed === null);

        // The forecast has no national field, so use the most common area value.
        const forecasts = forecast?.items?.[0]?.forecasts ?? [];
        let forecastText: string;
        if (forecasts.length === 0) {
          forecastText = "No forecast available";
        } else {
          const counts = new Map<string, number>();
          for (const entry of forecasts) {
            counts.set(entry.forecast, (counts.get(entry.forecast) ?? 0) + 1);
          }
          let majority = forecasts[0].forecast;
          let maxCount = 0;
          for (const [text, count] of counts) {
            if (count > maxCount) {
              maxCount = count;
              majority = text;
            }
          }
          forecastText = `Island-wide: ${majority}`;
        }

        const psiTwentyFourHourly =
          psi?.items?.[0]?.readings?.psi_twenty_four_hourly;
        const pm25OneHourly =
          pm25Response?.data.items[0]?.readings.pm25_one_hourly;

        const psiRegions = buildRegional(psiTwentyFourHourly);
        const pm25OneHourRegions = buildRegional(pm25OneHourly);
        const psiValue = worstRegionalOrNational(
          psiRegions,
          psiTwentyFourHourly,
        );
        const pm25OneHourValue = worstRegionalOrNational(
          pm25OneHourRegions,
          pm25OneHourly,
        );
        const uvValue = uvResponse ? extractLatestUv(uvResponse) : null;
        const fourDayRecord = fourDayResponse
          ? latestRecord(fourDayResponse.data.records)
          : null;
        const fourDay = (fourDayRecord?.forecasts ?? [])
          .filter((entry) => Number.isFinite(Date.parse(entry.timestamp)))
          .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
          .slice(0, 4)
          .map((entry) => ({
            day: entry.day,
            text: entry.forecast.text,
            tempLow: entry.temperature.low,
            tempHigh: entry.temperature.high,
          }));

        const temperatureReadings =
          temperature?.items?.[0]?.readings?.map((entry) => entry.value) ?? [];
        const humidityReadings =
          humidity?.items?.[0]?.readings?.map((entry) => entry.value) ?? [];

        const data = {
          temperature: average(temperatureReadings),
          humidity: average(humidityReadings),
          psi: psiValue,
          psiStatus: getPsiStatus(psiValue),
          psiRegions,
          pm25OneHour: pm25OneHourValue,
          pm25OneHourBand: getPm25Band(pm25OneHourValue),
          pm25OneHourRegions,
          uv: uvValue,
          uvStatus: getUvStatus(uvValue),
          fourDay,
          forecast: forecastText,
          rainOutlook: {
            nextTwoHours: buildNextTwoHours(forecast?.items?.[0]),
            periods: buildRainPeriods(twentyFourHourResponse, Date.now()),
          },
          lastUpdated: latestIsoTimestamp([
            forecast?.items?.[0]?.update_timestamp,
            forecast?.items?.[0]?.timestamp,
            psi?.items?.[0]?.update_timestamp,
            psi?.items?.[0]?.timestamp,
            temperature?.items?.[0]?.update_timestamp,
            temperature?.items?.[0]?.timestamp,
            humidity?.items?.[0]?.update_timestamp,
            humidity?.items?.[0]?.timestamp,
            uvResponse?.data.records[0]?.updatedTimestamp,
            uvResponse?.data.records[0]?.timestamp,
            pm25Response?.data.items[0]?.updatedTimestamp,
            pm25Response?.data.items[0]?.timestamp,
            fourDayResponse?.data.records[0]?.timestamp,
          ]),
        } satisfies WeatherData;

        return { data, partial };
      },
      {
        signal,
        ttlForValue: (snapshot) =>
          snapshot.partial ? WEATHER_PARTIAL_TTL_MS : WEATHER_CACHE_TTL_MS,
      },
    )
    .then((snapshot) => snapshot.data);

// ---------- Lightning and heavy-rain alerts ----------

// Lightning arrives in two-minute records; poll near that pace.
const WEATHER_ALERTS_CACHE_TTL_MS = 2 * 60 * 1000;
const FORECAST_AREAS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Live area labels, or the bundled ones: names alone must not fail the alerts. */
const getForecastAreas = (): Promise<ReadonlyArray<ForecastArea>> =>
  cache
    .get("forecast-areas", FORECAST_AREAS_CACHE_TTL_MS, async () => {
      const response = await httpGetJson(
        "data.gov.sg",
        `${DATA_GOV_V2_BASE_URL}/two-hr-forecast`,
        { Accept: "application/json" },
        DataGovForecastAreasResponseSchema,
        DEFAULT_TIMEOUT_MS,
      );
      return response.data.area_metadata.map((area) => ({
        name: area.name,
        lat: area.label_location.latitude,
        lng: area.label_location.longitude,
      }));
    })
    .then((areas) => (areas.length > 0 ? areas : FALLBACK_FORECAST_AREAS))
    .catch(() => FALLBACK_FORECAST_AREAS);

/**
 * `date=<today>` returns the newest page of the day, newest first. Just after
 * midnight the window also reaches into yesterday, so fetch both then.
 */
const datesCovering = (now: number, windowMs: number): string[] => [
  ...new Set([singaporeDate(now), singaporeDate(now - windowMs)]),
];

/**
 * Every page fetched, or null when any one fails (a gap could hide a storm).
 * A date with no records yet, as just after midnight, is a 404: an empty page.
 * The summaries treat a feed with no recent records as stalled, so reading a
 * misleading 404 as empty cannot pass for calm.
 */
const dataGovDays = async <A>(
  endpoint: string,
  dates: string[],
  schema: z.ZodType<A>,
  empty: A,
): Promise<A[] | null> => {
  const separator = endpoint.includes("?") ? "&" : "?";
  const pages = await Promise.all(
    dates.map((date) =>
      httpGetJson(
        "data.gov.sg",
        `${DATA_GOV_V2_BASE_URL}${endpoint}${separator}date=${date}`,
        { Accept: "application/json" },
        schema,
        DEFAULT_TIMEOUT_MS,
      ).catch((error: unknown) =>
        error instanceof ExternalApiError && error.status === 404 ? empty : null,
      ),
    ),
  );
  return pages.every((page) => page !== null) ? (pages as A[]) : null;
};

export const getWeatherAlerts = (signal?: AbortSignal): Promise<WeatherAlerts> =>
  cache.get(
    "weather-alerts",
    WEATHER_ALERTS_CACHE_TTL_MS,
    async () => {
      const now = Date.now();
      const [areas, lightningPages, rainPages] = await Promise.all([
        getForecastAreas(),
        dataGovDays(
          "/weather?api=lightning",
          datesCovering(now, LIGHTNING_WINDOW_MS),
          DataGovLightningResponseSchema,
          { data: { records: [] } },
        ),
        dataGovDays(
          "/rainfall",
          datesCovering(now, RAIN_LOOKBACK_MS),
          DataGovRainfallResponseSchema,
          { data: { stations: [], readings: [] } },
        ),
      ]);
      if (!lightningPages && !rainPages) {
        throw new ExternalApiError({
          service: "data.gov.sg",
          status: 502,
          message: "Lightning and rainfall endpoints failed",
        });
      }
      const lightning = lightningPages
        ? summarizeLightning(
            { data: { records: lightningPages.flatMap((page) => page.data.records) } },
            areas,
            now,
          )
        : null;
      const rain = rainPages
        ? summarizeRain(
            {
              data: {
                stations: rainPages.flatMap((page) => page.data.stations),
                readings: rainPages.flatMap((page) => page.data.readings),
              },
            },
            areas,
            now,
          )
        : null;
      return { lightning, rain };
    },
    { signal },
  );
