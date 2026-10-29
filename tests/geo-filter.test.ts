import { describe, expect, test } from "bun:test";
import {
  buildGeoFilterCircleGeoJson,
  buildGeoFilterMaskGeoJson,
  distanceM,
  featuresTouchingRadius,
  formatRadius,
  geometryTouchesRadius,
  withinRadius,
  type GeoFilter,
} from "@/lib/geo-filter";

// Raffles Place MRT, roughly.
const CENTER = [103.8515, 1.2840] as const;
const FILTER: GeoFilter = { center: CENTER, radiusM: 1_000 };
// Roughly 1 km in degrees; only used to place fixtures clearly in or out.
const DEG_PER_KM = 1 / 111;

describe("distanceM", () => {
  // Reference distances from Vincenty's inverse formula on WGS84.
  test.each([
    ["north", [CENTER[0], CENTER[1] + 0.045], 4_975.868],
    ["east", [CENTER[0] + 0.045, CENTER[1]], 5_008.128],
    ["south-east", [CENTER[0] + 0.03, CENTER[1] - 0.03], 4_706.538],
  ] as const)("matches the WGS84 geodesic %s of centre", (_, point, expected) => {
    expect(Math.abs(distanceM(CENTER, point) - expected)).toBeLessThan(0.05);
  });

  test("north–south degrees are shorter than east–west near the equator", () => {
    const north = distanceM(CENTER, [CENTER[0], CENTER[1] + 0.01]);
    const east = distanceM(CENTER, [CENTER[0] + 0.01, CENTER[1]]);
    expect(north).toBeLessThan(east);
  });
});

describe("withinRadius", () => {
  const points = [
    { id: "near", lng: CENTER[0], lat: CENTER[1] + 0.5 * DEG_PER_KM },
    { id: "far", lng: CENTER[0], lat: CENTER[1] + 1.5 * DEG_PER_KM },
    { id: "bad", lng: Number.NaN, lat: CENTER[1] },
  ];

  test("returns the input untouched without a filter", () => {
    expect(withinRadius(points, null, (p) => [p.lng, p.lat])).toBe(points);
  });

  test("keeps only points inside the radius", () => {
    expect(
      withinRadius(points, FILTER, (p) => [p.lng, p.lat]).map((p) => p.id),
    ).toEqual(["near"]);
  });
});

describe("geometryTouchesRadius", () => {
  test("line crossing the circle with no vertex inside", () => {
    expect(
      geometryTouchesRadius(FILTER, {
        type: "LineString",
        coordinates: [
          [CENTER[0] - 3 * DEG_PER_KM, CENTER[1]],
          [CENTER[0] + 3 * DEG_PER_KM, CENTER[1]],
        ],
      }),
    ).toBe(true);
  });

  test("line passing outside the circle", () => {
    expect(
      geometryTouchesRadius(FILTER, {
        type: "MultiLineString",
        coordinates: [
          [
            [CENTER[0] - 3 * DEG_PER_KM, CENTER[1] + 2 * DEG_PER_KM],
            [CENTER[0] + 3 * DEG_PER_KM, CENTER[1] + 2 * DEG_PER_KM],
          ],
        ],
      }),
    ).toBe(false);
  });

  test("polygon that fully contains the circle", () => {
    const d = 5 * DEG_PER_KM;
    expect(
      geometryTouchesRadius(FILTER, {
        type: "Polygon",
        coordinates: [
          [
            [CENTER[0] - d, CENTER[1] - d],
            [CENTER[0] + d, CENTER[1] - d],
            [CENTER[0] + d, CENTER[1] + d],
            [CENTER[0] - d, CENTER[1] + d],
            [CENTER[0] - d, CENTER[1] - d],
          ],
        ],
      }),
    ).toBe(true);
  });

  test("polygon well outside the circle", () => {
    const x = CENTER[0] + 5 * DEG_PER_KM;
    const d = DEG_PER_KM;
    expect(
      geometryTouchesRadius(FILTER, {
        type: "MultiPolygon",
        coordinates: [
          [
            [
              [x, CENTER[1]],
              [x + d, CENTER[1]],
              [x + d, CENTER[1] + d],
              [x, CENTER[1]],
            ],
          ],
        ],
      }),
    ).toBe(false);
  });
});

describe("featuresTouchingRadius", () => {
  test("filters a feature list by geometry", () => {
    const features = [
      { id: "a", geometry: { type: "Point" as const, coordinates: [...CENTER] } },
      {
        id: "b",
        geometry: {
          type: "Point" as const,
          coordinates: [CENTER[0], CENTER[1] + 2 * DEG_PER_KM],
        },
      },
    ];
    expect(featuresTouchingRadius(features, FILTER).map((f) => f.id)).toEqual(["a"]);
    expect(featuresTouchingRadius(features, null)).toBe(features);
  });
});

describe("buildGeoFilterCircleGeoJson", () => {
  test("is empty without a filter", () => {
    expect(buildGeoFilterCircleGeoJson(null).features).toEqual([]);
  });

  test("produces a closed ring at the requested radius", () => {
    const ring = buildGeoFilterCircleGeoJson(FILTER, 32).features[0].geometry.coordinates[0];
    expect(ring).toHaveLength(33);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    for (const point of ring) {
      expect(distanceM(CENTER, point)).toBeCloseTo(1_000, 0);
    }
  });
});

describe("buildGeoFilterMaskGeoJson", () => {
  test("is empty without a filter", () => {
    expect(buildGeoFilterMaskGeoJson(null).features).toEqual([]);
  });

  test("cuts the circle out of a world ring", () => {
    const [world, hole] = buildGeoFilterMaskGeoJson(FILTER).features[0].geometry.coordinates;
    expect(world[0]).toEqual([-180, -85]);
    expect(distanceM(CENTER, hole[0])).toBeCloseTo(1_000, 0);
  });
});

describe("formatRadius", () => {
  test("formats metres and kilometres", () => {
    expect(formatRadius(250)).toBe("250 m");
    expect(formatRadius(1_000)).toBe("1 km");
    expect(formatRadius(1_250)).toBe("1.25 km");
    expect(formatRadius(2_500)).toBe("2.5 km");
  });
});
