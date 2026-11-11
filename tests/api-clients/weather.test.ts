import { describe, expect, test } from "bun:test";
import { getPm25Band, getPsiStatus } from "@/lib/air-quality";
import { cache } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import {
  extractLatestUv,
  getUvStatus,
  getWeather,
} from "@/lib/api-clients/weather";
import { rejection, withFetch, type FetchStub } from "../helpers/upstream";

const runWithFetch = (fetchImpl: FetchStub) => withFetch(fetchImpl, getWeather);

describe("getWeather", () => {
  test("classifies NEA PSI descriptors", () => {
    expect(getPsiStatus(null)).toBe("Unknown");
    expect(getPsiStatus(50)).toBe("Good");
    expect(getPsiStatus(100)).toBe("Moderate");
    expect(getPsiStatus(200)).toBe("Unhealthy");
    expect(getPsiStatus(300)).toBe("Very Unhealthy");
    expect(getPsiStatus(301)).toBe("Hazardous");
  });

  test("classifies NEA 1-hr PM2.5 bands", () => {
    expect(getPm25Band(null)).toBe("Unknown");
    expect(getPm25Band(55)).toBe("Normal");
    expect(getPm25Band(56)).toBe("Elevated");
    expect(getPm25Band(150)).toBe("Elevated");
    expect(getPm25Band(250)).toBe("High");
    expect(getPm25Band(251)).toBe("Very High");
  });

  test("reports NEA 24-hr PSI and 1-hr PM2.5 by region, headlining the worst", async () => {
    const weather = await runWithFetch(async (input) => {
      const url = String(input);
      if (url.includes("/psi")) {
        return Response.json({
          items: [
            {
              timestamp: "2026-01-01T00:00:00+08:00",
              readings: {
                psi_twenty_four_hourly: {
                  north: 107,
                  south: 131,
                  east: 145,
                  west: 146,
                  central: 144,
                },
                // Must be ignored: PSI comes from NEA's own index, not PM2.5.
                pm25_twenty_four_hourly: { north: 500 },
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
                    north: 88,
                    south: 173,
                    east: 160,
                    west: 195,
                  },
                },
              },
            ],
          },
        });
      }
      return new Response("unavailable", { status: 503 });
    });

    expect(weather.psi).toBe(146);
    expect(weather.psiStatus).toBe("Unhealthy");
    expect(weather.psiRegions).toEqual({
      north: 107,
      south: 131,
      east: 145,
      west: 146,
      central: 144,
    });
    expect(weather.pm25OneHour).toBe(195);
    expect(weather.pm25OneHourBand).toBe("High");
    expect(weather.pm25OneHourRegions).toEqual({
      north: 88,
      south: 173,
      east: 160,
      west: 195,
      central: null,
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
    const weather = await runWithFetch(async (input) => {
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

    expect(weather.forecast).toBe("Island-wide: Cloudy");
    expect(weather.temperature).toBeNull();
    expect(weather.humidity).toBeNull();
    expect(weather.psi).toBeNull();
    expect(weather.psiStatus).toBe("Unknown");
    expect(weather.pm25OneHour).toBeNull();
    expect(weather.pm25OneHourBand).toBe("Unknown");
    expect(weather.uv).toBeNull();
    expect(weather.fourDay).toEqual([]);
  });

  test("maps and caps the four-day outlook while UV may fail", async () => {
    const weather = await runWithFetch(async (input) => {
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

    expect(weather.uv).toBeNull();
    expect(weather.uvStatus).toBe("Unknown");
    expect(weather.fourDay).toHaveLength(4);
    expect(weather.fourDay[0]).toEqual({
      day: "Day 1",
      text: "Cloudy",
      tempLow: 25,
      tempHigh: 32,
    });
  });

  test("caches a partial result for the short TTL, not five minutes", async () => {
    const realNow = Date.now;
    const originalFetch = globalThis.fetch;
    let now = realNow();
    let calls = 0;
    Date.now = () => now;
    cache.clear();

    globalThis.fetch = (async (input) => {
      calls += 1;
      if (String(input).includes("2-hour-weather-forecast")) {
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
    }) as typeof fetch;

    try {
      await getWeather();
      expect(calls).toBe(7);

      now += 20_000;
      await getWeather();
      expect(calls).toBe(7);

      now += 11_000;
      await getWeather();
      expect(calls).toBe(14);
    } finally {
      Date.now = realNow;
      globalThis.fetch = originalFetch;
      cache.clear();
    }
  });

  test("fails when every weather endpoint fails", async () => {
    const error = await rejection(
      runWithFetch(async () => new Response("unavailable", { status: 503 })),
    );

    expect(error).toBeInstanceOf(ExternalApiError);
  });
});
