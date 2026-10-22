import { describe, expect, test } from "bun:test";
import { FetchHttpClient } from "@effect/platform";
import { Effect } from "effect";
import { getAqiStatus, pm25ToAqi } from "@/lib/aqi";
import { CacheLive } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import {
  extractLatestUv,
  getUvStatus,
  getWeather,
} from "@/lib/api-clients/weather";

const runWithFetch = (
  fetchImpl: (input: string | URL | Request) => Promise<Response>,
) =>
  Effect.runPromiseExit(
    getWeather().pipe(
      Effect.provide(CacheLive),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetchImpl as unknown as typeof fetch,
      ),
    ),
  );

describe("getWeather", () => {
  test("converts PM2.5 to US EPA AQI", () => {
    expect(pm25ToAqi(null)).toBeNull();
    expect(pm25ToAqi(9)).toBe(50);
    expect(pm25ToAqi(35.4)).toBe(100);
    expect(pm25ToAqi(55.4)).toBe(150);
    expect(pm25ToAqi(125.4)).toBe(200);
    expect(pm25ToAqi(225.4)).toBe(300);
    expect(pm25ToAqi(1000)).toBe(500);
  });

  test("classifies US AQI bands", () => {
    expect(getAqiStatus(null)).toBe("Unknown");
    expect(getAqiStatus(50)).toBe("Good");
    expect(getAqiStatus(100)).toBe("Moderate");
    expect(getAqiStatus(150)).toBe("Unhealthy for Sensitive Groups");
    expect(getAqiStatus(200)).toBe("Unhealthy");
    expect(getAqiStatus(300)).toBe("Very Unhealthy");
    expect(getAqiStatus(301)).toBe("Hazardous");
  });

  test("leaves regions without PM2.5 empty instead of mixing in PSI", async () => {
    const exit = await runWithFetch(async (input) => {
      const url = String(input);
      if (url.includes("/psi")) {
        return Response.json({
          items: [
            {
              readings: {
                psi_twenty_four_hourly: { north: 300, south: 300 },
                pm25_twenty_four_hourly: { south: 9 },
              },
            },
          ],
        });
      }
      return new Response("unavailable", { status: 503 });
    });

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.aqiRegions.north).toBeNull();
    expect(exit.value.aqiRegions.south).toBe(50);
    expect(exit.value.aqi).toBe(50);
  });

  test("derives regional US AQI for 24-hr and 1-hr windows using the worst region", async () => {
    const exit = await runWithFetch(async (input) => {
      const url = String(input);
      if (url.includes("/psi")) {
        return Response.json({
          items: [
            {
              timestamp: "2026-01-01T00:00:00+08:00",
              readings: {
                pm25_twenty_four_hourly: {
                  north: 9,
                  south: 9,
                  east: 9,
                  west: 35.4,
                  central: 9,
                },
              },
            },
          ],
        });
      }
      if (url.includes("/pm25")) {
        return Response.json({
          data: {
            items: [
              {
                timestamp: "2026-01-01T00:00:00+08:00",
                readings: {
                  pm25_one_hourly: {
                    north: 9,
                    south: 35.4,
                    east: 55.4,
                    west: 125.4,
                    central: 35.4,
                  },
                },
              },
            ],
          },
        });
      }
      return new Response("unavailable", { status: 503 });
    });

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.aqi).toBe(100);
    expect(exit.value.aqiStatus).toBe("Moderate");
    expect(exit.value.aqiRegions).toEqual({
      north: 50,
      south: 50,
      east: 50,
      west: 100,
      central: 50,
    });
    expect(exit.value.aqiOneHour).toBe(200);
    expect(exit.value.aqiOneHourStatus).toBe("Unhealthy");
    expect(exit.value.aqiOneHourRegions).toEqual({
      north: 50,
      south: 100,
      east: 150,
      west: 200,
      central: 100,
    });
  });

  test("classifies UV index bands", () => {
    expect(getUvStatus(null)).toBe("Unknown");
    expect(getUvStatus(2)).toBe("Low");
    expect(getUvStatus(5)).toBe("Moderate");
    expect(getUvStatus(7)).toBe("High");
    expect(getUvStatus(10)).toBe("Very High");
    expect(getUvStatus(11)).toBe("Extreme");
  });

  test("extracts the latest finite UV index entry", () => {
    expect(
      extractLatestUv({
        data: {
          records: [
            {
              timestamp: "2026-01-01T18:00:00+08:00",
              index: [
                { hour: "2026-01-01T17:00:00+08:00", value: 2 },
                { hour: "2026-01-01T18:00:00+08:00", value: 5 },
              ],
            },
            {
              timestamp: "2026-01-02T18:00:00+08:00",
              index: [{ hour: "2026-01-02T18:00:00+08:00", value: 7 }],
            },
          ],
        },
      }),
    ).toBe(7);
  });

  test("returns partial data when one endpoint succeeds", async () => {
    const exit = await runWithFetch(async (input) => {
      const url = String(input);
      if (url.includes("2-hour-weather-forecast")) {
        return Response.json({
          items: [
            {
              timestamp: "2026-01-01T00:00:00.000Z",
              forecasts: [{ area: "Singapore", forecast: "Cloudy" }],
            },
          ],
        });
      }
      return new Response("unavailable", { status: 503 });
    });

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.forecast).toBe("Island-wide: Cloudy");
    expect(exit.value.temperature).toBeNull();
    expect(exit.value.humidity).toBeNull();
    expect(exit.value.aqi).toBeNull();
    expect(exit.value.aqiStatus).toBe("Unknown");
    expect(exit.value.aqiOneHour).toBeNull();
    expect(exit.value.aqiOneHourStatus).toBe("Unknown");
    expect(exit.value.uv).toBeNull();
    expect(exit.value.fourDay).toEqual([]);
  });

  test("maps and caps the four-day outlook while UV may fail", async () => {
    const exit = await runWithFetch(async (input) => {
      const url = String(input);
      if (url.includes("2-hour-weather-forecast")) {
        return Response.json({
          items: [{ timestamp: "2026-01-01T00:00:00.000Z", forecasts: [] }],
        });
      }
      if (url.includes("four-day-outlook")) {
        return Response.json({
          code: 0,
          data: {
            records: [
              {
                timestamp: "2026-01-01T17:00:00+08:00",
                forecasts: Array.from({ length: 5 }, (_, index) => ({
                  day: `Day ${index + 1}`,
                  timestamp: `2026-01-${String(index + 2).padStart(2, "0")}T00:00:00+08:00`,
                  forecast: { text: "Cloudy", code: "CL" },
                  temperature: { low: 25 + index, high: 32 + index },
                })),
              },
            ],
          },
        });
      }
      return new Response("unavailable", { status: 503 });
    });

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.uv).toBeNull();
    expect(exit.value.uvStatus).toBe("Unknown");
    expect(exit.value.fourDay).toHaveLength(4);
    expect(exit.value.fourDay[0]).toEqual({
      day: "Day 1",
      text: "Cloudy",
      tempLow: 25,
      tempHigh: 32,
    });
  });

  test("fails when every weather endpoint fails", async () => {
    const exit = await runWithFetch(async () =>
      new Response("unavailable", { status: 503 }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    expect(exit.cause.error).toBeInstanceOf(ExternalApiError);
  });
});
