/**
 * Data.gov.sg weather client: 2-hour forecast, 24h PSI, air temperature, and
 * relative humidity, aggregated into a single `WeatherData`.
 *
 * The four endpoints are independent: when some fail, the rest still produce
 * a usable (partially nulled) reading. The whole source fails only when
 * every endpoint fails, so a single flaky sub-feed no longer blanks the
 * weather panel.
 */
import { HttpClient } from "@effect/platform";
import { Effect, Either, Schema } from "effect";
import { Cache } from "@/lib/cache";
import { ExternalApiError, type UpstreamError } from "@/lib/errors";
import {
  DataGovForecastResponseSchema,
  DataGovHumidityResponseSchema,
  DataGovPsiResponseSchema,
  DataGovTemperatureResponseSchema,
} from "@/types/schemas";
import type { WeatherData } from "@/types";
import { DEFAULT_TIMEOUT_MS, httpGetJson } from "./http";

const DATA_GOV_BASE_URL = "https://api.data.gov.sg/v1/environment";

const dataGovGet = <A, I>(
  endpoint: string,
  schema: Schema.Schema<A, I, never>,
): Effect.Effect<A, UpstreamError, HttpClient.HttpClient> =>
  httpGetJson(
    "data.gov.sg",
    `${DATA_GOV_BASE_URL}${endpoint}`,
    { Accept: "application/json" },
    schema,
    DEFAULT_TIMEOUT_MS,
  );

const getPsiStatus = (psi: number | null): WeatherData["psiStatus"] => {
  if (psi === null) return "Unknown";
  if (psi <= 50) return "Good";
  if (psi <= 100) return "Moderate";
  return "Unhealthy";
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

const nationalOrMeanRegional = (
  readings: RegionalReading | undefined,
): number | null => {
  if (!readings) return null;
  if (Number.isFinite(readings.national)) return readings.national as number;
  // Prefer the mean across regions over the max: max overstates island-wide
  // PSI when a single region spikes.
  const regionalValues = [
    readings.north,
    readings.east,
    readings.west,
    readings.central,
    readings.south,
  ].filter((value): value is number => Number.isFinite(value));
  if (regionalValues.length === 0) return null;
  const mean =
    regionalValues.reduce((sum, value) => sum + value, 0) /
    regionalValues.length;
  return Math.round(mean * 10) / 10;
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

        const [forecastR, psiR, temperatureR, humidityR] = results;
        const forecast = right(forecastR);
        const psi = right(psiR);
        const temperature = right(temperatureR);
        const humidity = right(humidityR);

        // Use a majority-aggregate across all areas instead of picking a
        // single area (which could be "Ang Mo Kio") and labelling it as
        // "Singapore". The data.gov.sg 2-hour forecast has no national
        // field, so we find the most common forecast text.
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

        const psiValue = nationalOrMeanRegional(
          psi?.items?.[0]?.readings?.psi_twenty_four_hourly,
        );

        const temperatureReadings =
          temperature?.items?.[0]?.readings?.map((entry) => entry.value) ?? [];
        const humidityReadings =
          humidity?.items?.[0]?.readings?.map((entry) => entry.value) ?? [];

        return {
          temperature: average(temperatureReadings),
          humidity: average(humidityReadings),
          psi: psiValue,
          psiStatus: getPsiStatus(psiValue),
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
          ]),
        } satisfies WeatherData;
      }),
    );
  });
