import { describe, expect, test } from "bun:test";
import {
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
} from "@/lib/geo-filter";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import {
  parseGeoFilterCenter,
  parseGeoFilterRadius,
  parseLayerOptionSelection,
  parseMrtStation,
  parseNotificationPrefs,
  parseSeenSignals,
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

  test("reverts a stored all-off sub-filter selection to all on", () => {
    // The toggle UI never strands a layer with every option off (deselecting
    // the last one reverts to all), so a stored all-false must not win over
    // defaults either.
    const allOn = { flights: true, parks: true };
    expect(parseLayerOptionSelection({ flights: false, parks: false }, allOn)).toEqual(allOn);
    expect(parseLayerOptionSelection({ flights: false }, allOn)).toEqual({
      flights: false,
      parks: true,
    });
    expect(parseLayerOptionSelection(null, allOn)).toBeUndefined();
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

  test("applies stored notification flags over defaults", () => {
    expect(parseNotificationPrefs({ road: false, browser: "yes" })).toEqual({
      ...DEFAULT_NOTIFICATION_PREFS,
      road: false,
    });
    expect(parseNotificationPrefs(null)).toBeUndefined();
  });

  test("keeps only well-formed seen signal categories", () => {
    expect(
      parseSeenSignals({ rail: ["a"], road: [1], weather: "x", removed: ["b"] }),
    ).toEqual({ rail: ["a"] });
    expect(parseSeenSignals(null)).toBeUndefined();
    expect(parseSeenSignals(["a"])).toBeUndefined();
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
