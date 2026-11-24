import { describe, expect, it } from "bun:test";
import {
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
} from "@/lib/geo-filter";
import { DEFAULT_SENSOR_VISIBILITY, LAYERS } from "@/lib/layers";
import {
  buildViewLinkUrl,
  DEFAULT_MAP_CAMERA,
  parseViewLinkParams,
} from "@/lib/view-link";

describe("view-link", () => {
  it("round-trips camera, layers, radius filter, and map focus", () => {
    const sensorVisibility = {
      ...DEFAULT_SENSOR_VISIBILITY,
      flights: false,
      mrt: true,
      cameras: true,
      incidents: true,
      parks: true,
    };

    const url = buildViewLinkUrl("https://argus.sg/dashboard", {
      camera: { lat: 1.3048234, lng: 103.8318123, zoom: 13.456 },
      sensorVisibility,
      geoFilter: { center: [103.8318123, 1.3048234], radiusM: 1500 },
      mapFocus: true,
    });

    const parsed = parseViewLinkParams(new URL(url).search);
    expect(parsed.camera).toEqual({ lat: 1.30482, lng: 103.83181, zoom: 13.46 });
    expect(parsed.sensorVisibility).toEqual(sensorVisibility);
    expect(parsed.geoFilter).toEqual({
      center: [103.83181, 1.30482],
      radiusM: 1500,
    });
    expect(parsed.mapFocus).toBe(true);
  });

  it("encodes all-off layers as layers=none and restores all false", () => {
    const allOff = Object.fromEntries(
      LAYERS.map((layer) => [layer.key, false]),
    ) as typeof DEFAULT_SENSOR_VISIBILITY;

    const url = buildViewLinkUrl("https://argus.sg/", {
      camera: DEFAULT_MAP_CAMERA,
      sensorVisibility: allOff,
    });

    expect(new URL(url).searchParams.get("layers")).toBe("none");
    const parsed = parseViewLinkParams(new URL(url).search);
    expect(parsed.sensorVisibility).toEqual(allOff);
    expect(parsed.mapFocus).toBeUndefined();
    expect(parsed.geoFilter).toBeUndefined();
  });

  it("ignores malformed or out-of-range parameters safely", () => {
    const parsed = parseViewLinkParams(
      "?lat=999&lng=103.8&z=11&layers=unknown1,unknown2&r=1.3,notanumber,1000&focus=0",
    );
    expect(parsed.camera).toBeUndefined();
    expect(parsed.sensorVisibility).toBeUndefined();
    expect(parsed.geoFilter).toBeUndefined();
    expect(parsed.mapFocus).toBeUndefined();
  });

  it("clamps zoom and radius to allowed bounds", () => {
    const parsed = parseViewLinkParams(
      "?lat=1.35&lng=103.82&z=99&r=1.35,103.82,999999&focus=true",
    );
    expect(parsed.camera).toEqual({ lat: 1.35, lng: 103.82, zoom: 22 });
    expect(parsed.geoFilter).toEqual({
      center: [103.82, 1.35],
      radiusM: GEO_FILTER_MAX_RADIUS_M,
    });
    expect(parsed.mapFocus).toBe(true);

    const parsedLow = parseViewLinkParams("?lat=1.35&lng=103.82&z=-5&r=1.35,103.82,10");
    expect(parsedLow.camera).toEqual({ lat: 1.35, lng: 103.82, zoom: 0 });
    expect(parsedLow.geoFilter?.radiusM).toBe(GEO_FILTER_MIN_RADIUS_M);
  });

  it("drops unknown layer keys while keeping valid ones", () => {
    const parsed = parseViewLinkParams("?layers=mrt,bogus,cameras");
    expect(parsed.sensorVisibility?.mrt).toBe(true);
    expect(parsed.sensorVisibility?.cameras).toBe(true);
    expect(parsed.sensorVisibility?.flights).toBe(false);
  });
});
