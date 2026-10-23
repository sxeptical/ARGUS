/**
 * Aggregates Data.gov.sg weather feeds, including PM2.5-derived US AQI.
 * Endpoints fail independently; the source fails only when all feeds fail.
 */
import { HttpClient } from "@effect/platform";
import { Effect, Either, Schema } from "effect";
import { Cache } from "@/lib/cache";
import { ExternalApiError, type UpstreamError } from "@/lib/errors";
import {
  DataGovForecastResponseSchema,
  DataGovFourDayResponseSchema,
  DataGovHumidityResponseSchema,
  DataGovPm25ResponseSchema,
  DataGovPsiResponseSchema,
  DataGovTemperatureResponseSchema,
  DataGovUvResponseSchema,
} from "@/types/schemas";
import type { AqiRegionKey, RegionalAqiReadings, WeatherData } from "@/types";
import { getAqiStatus, pm25ToAqi } from "@/lib/aqi";
import { DEFAULT_TIMEOUT_MS, httpGetJson } from "./http";

const DATA_GOV_BASE_URL = "https://api.data.gov.sg/v1/environment";
const DATA_GOV_V2_BASE_URL = "https://api-open.data.gov.sg/v2/real-time/api";

const dataGovGet = <A, I>(
  endpoint: string,
  schema: Schema.Schema<A, I, never>,
  baseUrl: string = DATA_GOV_BASE_URL,
): Effect.Effect<A, UpstreamError, HttpClient.HttpClient> =>
  httpGetJson(
    "data.gov.sg",
    `${baseUrl}${endpoint}`,
    { Accept: "application/json" },
    schema,
    DEFAULT_TIMEOUT_MS,
  );

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

const AQI_REGION_KEYS: ReadonlyArray<AqiRegionKey> = [
  "north",
  "south",
  "east",
  "west",
  "central",
];

// Regions without a PM2.5 reading stay null rather than falling back to PSI,
// so every value in the result is on the US AQI scale.
const buildRegionalAqi = (
  pm25Readings: RegionalReading | undefined,
): RegionalAqiReadings => {
  const result = {} as RegionalAqiReadings;
  for (const key of AQI_REGION_KEYS) {
    result[key] = pm25ToAqi(pm25Readings?.[key] ?? null);
  }
  return result;
};

// The headline is the worst region (as US AQI apps report), falling back to a
// national PM2.5 reading when no regional values exist.
const worstRegionalOrNational = (
  regions: RegionalAqiReadings,
  pm25Readings: RegionalReading | undefined,
): number | null => {
  const finite = AQI_REGION_KEYS.map((key) => regions[key]).filter(
    (value): value is number => value !== null,
  );
  if (finite.length > 0) return Math.max(...finite);
  return pm25ToAqi(pm25Readings?.national ?? null);
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

const right = <A>(either: Either.Either<A, UpstreamError>): A | null =>
  either._tag === "Right" ? either.right : null;

export const getWeather = (): Effect.Effect<
  WeatherData,
  UpstreamError,
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
            Effect.either(
              dataGovGet(
                "/2-hour-weather-forecast",
                DataGovForecastResponseSchema,
              ),
            ),
            Effect.either(dataGovGet("/psi", DataGovPsiResponseSchema)),
            Effect.either(
              dataGovGet(
                "/air-temperature",
                DataGovTemperatureResponseSchema,
              ),
            ),
            Effect.either(
              dataGovGet(
                "/relative-humidity",
                DataGovHumidityResponseSchema,
              ),
            ),
            Effect.either(
              dataGovGet("/uv", DataGovUvResponseSchema, DATA_GOV_V2_BASE_URL),
            ),
            Effect.either(
              dataGovGet("/pm25", DataGovPm25ResponseSchema, DATA_GOV_V2_BASE_URL),
            ),
            Effect.either(
              dataGovGet(
                "/four-day-outlook",
                DataGovFourDayResponseSchema,
                DATA_GOV_V2_BASE_URL,
              ),
            ),
          ] as const,
          { concurrency: "unbounded" },
        );

        if (results.every((result) => result._tag === "Left")) {
          return yield* Effect.fail(
            new ExternalApiError({
              service: "data.gov.sg",
              status: 502,
              message: "All weather endpoints failed",
            }),
          );
        }

        const [forecastR, psiR, temperatureR, humidityR, uvR, pm25R, fourDayR] = results;
        const forecast = right(forecastR);
        const psi = right(psiR);
        const temperature = right(temperatureR);
        const humidity = right(humidityR);
        const uvResponse = right(uvR);
        const pm25Response = right(pm25R);
        const fourDayResponse = right(fourDayR);

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

        const pm25TwentyFourHourly =
          psi?.items?.[0]?.readings?.pm25_twenty_four_hourly;
        const pm25OneHourly =
          pm25Response?.data.items[0]?.readings.pm25_one_hourly;

        const aqiRegions = buildRegionalAqi(pm25TwentyFourHourly);
        const aqiOneHourRegions = buildRegionalAqi(pm25OneHourly);
        const aqiValue = worstRegionalOrNational(
          aqiRegions,
          pm25TwentyFourHourly,
        );
        const aqiOneHourValue = worstRegionalOrNational(
          aqiOneHourRegions,
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

        return {
          temperature: average(temperatureReadings),
          humidity: average(humidityReadings),
          aqi: aqiValue,
          aqiStatus: getAqiStatus(aqiValue),
          aqiOneHour: aqiOneHourValue,
          aqiOneHourStatus: getAqiStatus(aqiOneHourValue),
          aqiRegions,
          aqiOneHourRegions,
          uv: uvValue,
          uvStatus: getUvStatus(uvValue),
          fourDay,
          forecast: forecastText,
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
      }),
    );
  });
