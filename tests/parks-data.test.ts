import { describe, expect, test } from "bun:test";
import { PARKS_GEOJSON, PARK_COUNT, TRAIL_COUNT } from "@/lib/parks-data";

function coordinates(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number") return [value as number[]];
  return value.flatMap(coordinates);
}

describe("parks geometry", () => {
  test("contains valid Singapore recreation features", () => {
    for (const feature of PARKS_GEOJSON.features) {
      expect(["park", "pcn", "trail"]).toContain(feature.properties.kind);
      expect(feature.properties.name.length).toBeGreaterThan(0);
      for (const [lng, lat] of coordinates(feature.geometry.coordinates)) {
        expect(lng).toBeGreaterThanOrEqual(103.5);
        expect(lng).toBeLessThanOrEqual(104.1);
        expect(lat).toBeGreaterThanOrEqual(1.1);
        expect(lat).toBeLessThanOrEqual(1.5);
      }
    }
    expect(PARK_COUNT).toBeGreaterThan(100);
    expect(TRAIL_COUNT).toBeGreaterThan(100);
  });
});
