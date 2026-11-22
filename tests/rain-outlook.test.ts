import { describe, expect, test } from "bun:test";
import {
  buildNextTwoHours,
  buildRainPeriods,
  isRainForecast,
  isThunderyForecast,
} from "@/lib/rain-outlook";

describe("rain wordings", () => {
  test("NEA's rain forecasts count as rain; dry ones do not", () => {
    for (const text of ["Light Rain", "Passing Showers", "Thundery Showers", "Heavy Thundery Showers with Gusty Winds", "Drizzle"]) {
      expect(isRainForecast(text)).toBe(true);
    }
    for (const text of ["Partly Cloudy (Day)", "Fair (Night)", "Cloudy", "Hazy", "Windy"]) {
      expect(isRainForecast(text)).toBe(false);
    }
    expect(isThunderyForecast("Heavy Thundery Showers")).toBe(true);
    expect(isThunderyForecast("Showers")).toBe(false);
  });
});

describe("buildNextTwoHours", () => {
  test("keeps only the areas expecting rain, with the valid window", () => {
    expect(
      buildNextTwoHours({
        valid_period: { start: "2026-11-20T16:00:00+08:00", end: "2026-11-20T18:00:00+08:00" },
        forecasts: [
          { area: "Bedok", forecast: "Thundery Showers" },
          { area: "City", forecast: "Partly Cloudy (Day)" },
          { area: "Changi", forecast: "Light Rain" },
        ],
      }),
    ).toEqual({
      validFrom: "2026-11-20T16:00:00+08:00",
      validTo: "2026-11-20T18:00:00+08:00",
      areaCount: 3,
      rain: [
        { place: "Bedok", forecast: "Thundery Showers" },
        { place: "Changi", forecast: "Light Rain" },
      ],
    });
  });

  test("no forecast means no outlook", () => {
    expect(buildNextTwoHours(undefined)).toBeNull();
    expect(buildNextTwoHours({ forecasts: [] })).toBeNull();
  });
});

describe("buildRainPeriods", () => {
  const period = (start: string, end: string, text: string, regions: Record<string, string>) => ({
    timePeriod: { start, end, text },
    regions: Object.fromEntries(Object.entries(regions).map(([region, forecast]) => [region, { text: forecast }])),
  });

  test("drops elapsed periods and lists rainy regions in a fixed order", () => {
    const periods = buildRainPeriods(
      {
        data: {
          records: [
            {
              periods: [
                period("2026-11-20T06:00:00+08:00", "2026-11-20T12:00:00+08:00", "6 am to Midday 20 Nov", { west: "Showers" }),
                period("2026-11-20T12:00:00+08:00", "2026-11-20T18:00:00+08:00", "Midday to 6 pm 20 Nov", {
                  central: "Thundery Showers",
                  west: "Thundery Showers",
                  north: "Partly Cloudy (Day)",
                }),
              ],
            },
          ],
        },
      },
      Date.parse("2026-11-20T16:00:00+08:00"),
    );
    expect(periods).toEqual([
      {
        label: "Midday to 6 pm 20 Nov",
        start: "2026-11-20T12:00:00+08:00",
        end: "2026-11-20T18:00:00+08:00",
        regionCount: 3,
        rain: [
          { place: "West", forecast: "Thundery Showers" },
          { place: "Central", forecast: "Thundery Showers" },
        ],
      },
    ]);
  });

  test("a failed feed gives no periods", () => {
    expect(buildRainPeriods(null, Date.now())).toEqual([]);
  });
});
