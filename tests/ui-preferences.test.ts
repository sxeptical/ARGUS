import { describe, expect, test } from "bun:test";
import {
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
} from "@/lib/geo-filter";
import {
  parseGeoFilterCenter,
  parseGeoFilterRadius,
  parseSensorVisibility,
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
});
