import { describe, expect, test } from "bun:test";
import {
  GEO_FILTER_DEFAULT_RADIUS_M,
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
} from "@/lib/geo-filter";
import { DEFAULT_SENSOR_VISIBILITY, LAYERS, type SensorKey } from "@/lib/layers";
import { buildViewLinkUrl, parseViewLinkParams } from "@/lib/view-link";

describe("view-link URL serialization and parsing", () => {
  test("round-trips camera, layers, radius filter, and mapFocus mode", () => {
    const customVisibility = Object.fromEntries(
      LAYERS.map((layer) => [layer.key, false]),
    ) as Record<SensorKey, boolean>;
    customVisibility.mrt = true;
    customVisibility.hawkers = true;
    customVisibility.carparks = true;

    const url = buildViewLinkUrl("https://argus.example/?stale=1", {
      camera: { lat: 1.293456, lng: 103.851234, zoom: 14.25 },
      sensorVisibility: customVisibility,
      geoFilter: { center: [103.851234, 1.293456], radiusM: 1_500 },
      mapFocus: true,
    });

    const parsedUrl = new URL(url);
    expect(parsedUrl.searchParams.has("stale")).toBe(false);
    expect(parsedUrl.searchParams.get("focus")).toBe("1");

    const parsed = parseViewLinkParams(parsedUrl.search);
    expect(parsed.camera).toEqual({ lat: 1.29346, lng: 103.85123, zoom: 14.25 });
    expect(parsed.sensorVisibility).toEqual(customVisibility);
    expect(parsed.geoFilter).toEqual({
      center: [103.85123, 1.29346],
      radiusM: 1_500,
    });
    expect(parsed.mapFocus).toBe(true);
  });

  test("handles layers=none and ignores unknown layer keys", () => {
    const noneUrl = buildViewLinkUrl("https://argus.example/", {
      camera: { lat: 1.35, lng: 103.82, zoom: 11 },
      sensorVisibility: Object.fromEntries(
        LAYERS.map((layer) => [layer.key, false]),
      ) as Record<SensorKey, boolean>,
      geoFilter: null,
      mapFocus: false,
    });
    expect(new URL(noneUrl).searchParams.get("layers")).toBe("none");
    expect(new URL(noneUrl).searchParams.has("focus")).toBe(false);

    const parsedNone = parseViewLinkParams("?layers=none");
    expect(Object.values(parsedNone.sensorVisibility!).every((v) => !v)).toBe(true);

    const parsedMixed = parseViewLinkParams("?layers=mrt,notALayer,cameras");
    expect(parsedMixed.sensorVisibility!.mrt).toBe(true);
    expect(parsedMixed.sensorVisibility!.cameras).toBe(true);
    expect(parsedMixed.sensorVisibility!.busStops).toBe(false);
    expect("notALayer" in parsedMixed.sensorVisibility!).toBe(false);
  });

  test("ignores invalid or empty camera params", () => {
    expect(parseViewLinkParams("?lat=999&lng=103.8&z=12").camera).toBeUndefined();
    expect(parseViewLinkParams("?lat=&lng=103.8&z=12").camera).toBeUndefined();
    expect(parseViewLinkParams("?lat=1.35&lng=103.8&z=40").camera).toBeUndefined();
    expect(parseViewLinkParams("?lat=1.35&lng=103.8").camera).toBeUndefined();
  });

  test("clamps radius r and defaults missing r when rc is valid", () => {
    expect(parseViewLinkParams("?rc=103.85,1.29").geoFilter).toEqual({
      center: [103.85, 1.29],
      radiusM: GEO_FILTER_DEFAULT_RADIUS_M,
    });
    expect(parseViewLinkParams("?rc=103.85,1.29&r=10").geoFilter?.radiusM).toBe(
      GEO_FILTER_MIN_RADIUS_M,
    );
    expect(parseViewLinkParams("?rc=103.85,1.29&r=999999").geoFilter?.radiusM).toBe(
      GEO_FILTER_MAX_RADIUS_M,
    );
    expect(parseViewLinkParams("?rc=999,1.29&r=1000").geoFilter).toBeUndefined();
    expect(parseViewLinkParams("?rc=103.85,&r=1000").geoFilter).toBeUndefined();
  });

  test("does not depend on default sensor visibility object mutation", () => {
    const before = { ...DEFAULT_SENSOR_VISIBILITY };
    parseViewLinkParams("?layers=none");
    expect(DEFAULT_SENSOR_VISIBILITY).toEqual(before);
  });
});
