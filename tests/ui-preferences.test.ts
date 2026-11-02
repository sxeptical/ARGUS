import { describe, expect, test } from "bun:test";
import {
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
} from "@/lib/geo-filter";
import {
  parseGeoFilterCenter,
  parseGeoFilterRadius,
  parseMrtStation,
  parseSensorVisibility,
  parseStoredBoolean,
  prefKey,
} from "@/lib/ui-preferences";

describe("ui preference parsing", () => {
  const defaults = { flights: true, parks: false };

  test("applies stored sensor flags over defaults", () => {
    expect(parseSensorVisibility({ flights: false }, defaults)).toEqual({
      flights: false,
      parks: false,
    });
  });

  test("drops unknown and non-boolean sensor flags", () => {
    expect(
      parseSensorVisibility({ parks: "yes", removed: true }, defaults),
    ).toEqual(defaults);
  });

  test("rejects non-object sensor values", () => {
    expect(parseSensorVisibility(null, defaults)).toBeUndefined();
    expect(parseSensorVisibility([true], defaults)).toBeUndefined();
  });

  test("keeps a cleared filter centre and rejects malformed ones", () => {
    expect(parseGeoFilterCenter(null)).toBeNull();
    expect(parseGeoFilterCenter([103.85, 1.29])).toEqual([103.85, 1.29]);
    expect(parseGeoFilterCenter([103.85])).toBeUndefined();
    expect(parseGeoFilterCenter(["103.85", 1.29])).toBeUndefined();
    expect(parseGeoFilterCenter([200, 1.29])).toBeUndefined();
  });

  test("clamps the radius into the slider range", () => {
    expect(parseGeoFilterRadius(1_500)).toBe(1_500);
    expect(parseGeoFilterRadius(1)).toBe(GEO_FILTER_MIN_RADIUS_M);
    expect(parseGeoFilterRadius(1e9)).toBe(GEO_FILTER_MAX_RADIUS_M);
    expect(parseGeoFilterRadius(Number.NaN)).toBeUndefined();
    expect(parseGeoFilterRadius("1000")).toBeUndefined();
  });

  test("accepts only stations the router knows", () => {
    expect(parseMrtStation("Raffles Place")).toBe("Raffles Place");
    expect(parseMrtStation("")).toBeUndefined();
    expect(parseMrtStation(null)).toBeUndefined();
    expect(parseMrtStation(42)).toBeUndefined();
  });

  test("accepts real booleans only", () => {
    expect(parseStoredBoolean(true)).toBe(true);
    expect(parseStoredBoolean(false)).toBe(false);
    expect(parseStoredBoolean("true")).toBeUndefined();
    expect(parseStoredBoolean(0)).toBeUndefined();
    expect(parseStoredBoolean(null)).toBeUndefined();
  });

  test("derives stable slugged keys from text", () => {
    expect(prefKey("panel-expanded", "MRT ROUTER")).toBe(
      "argus.prefs.panel-expanded.v1:mrt-router",
    );
    expect(prefKey("weather-section", "4-Day Outlook")).toBe(
      "argus.prefs.weather-section.v1:4-day-outlook",
    );
    expect(prefKey("panel-expanded", "Radius Filter")).toBe(
      prefKey("panel-expanded", " radius  filter "),
    );
  });
});
