/**
 * NEA's chance of rain from its worded forecasts. NEA publishes no
 * percentages, so "chance" here is where and when NEA expects rain.
 */
import type { DataGovTwentyFourHourResponse } from "@/types/schemas";
import type { RainOutlook } from "@/types";

/** Covers NEA's rain wordings: Light Rain, Passing Showers, Thundery Showers, Drizzle, ... */
const RAIN_RE = /rain|shower|drizzle|thunder/i;
const THUNDER_RE = /thunder/i;

export const isRainForecast = (forecast: string): boolean => RAIN_RE.test(forecast);
export const isThunderyForecast = (forecast: string): boolean => THUNDER_RE.test(forecast);

const REGION_ORDER = ["north", "south", "east", "west", "central"];
const regionLabel = (region: string) => region.charAt(0).toUpperCase() + region.slice(1);

export function buildNextTwoHours(item: {
  readonly valid_period?: { readonly start: string; readonly end: string };
  readonly forecasts?: ReadonlyArray<{ readonly area: string; readonly forecast: string }>;
} | undefined): RainOutlook["nextTwoHours"] {
  const forecasts = item?.forecasts ?? [];
  if (forecasts.length === 0) return null;
  return {
    validFrom: item?.valid_period?.start ?? null,
    validTo: item?.valid_period?.end ?? null,
    areaCount: forecasts.length,
    rain: forecasts
      .filter((entry) => isRainForecast(entry.forecast))
      .map((entry) => ({ place: entry.area, forecast: entry.forecast })),
  };
}

/** Periods still running or ahead of `now`; NEA keeps the elapsed one until it reissues. */
export function buildRainPeriods(
  response: DataGovTwentyFourHourResponse | null,
  now: number,
): RainOutlook["periods"] {
  const periods = response?.data.records[0]?.periods ?? [];
  return periods
    .filter((period) => {
      const end = Date.parse(period.timePeriod.end);
      return !Number.isFinite(end) || end > now;
    })
    .map((period) => {
      const regions = Object.entries(period.regions).sort(
        ([a], [b]) => REGION_ORDER.indexOf(a) - REGION_ORDER.indexOf(b),
      );
      return {
        label: period.timePeriod.text,
        start: period.timePeriod.start,
        end: period.timePeriod.end,
        regionCount: regions.length,
        rain: regions
          .filter(([, forecast]) => isRainForecast(forecast.text))
          .map(([region, forecast]) => ({ place: regionLabel(region), forecast: forecast.text })),
      };
    });
}
