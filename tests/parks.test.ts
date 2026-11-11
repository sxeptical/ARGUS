import { describe, expect, test } from "bun:test";
import { PARK_COUNT, PARK_LABELS_GEOJSON, PARKS_GEOJSON, TRAIL_COUNT } from "@/lib/data/parks";
import { areaHectares, buildParkSearchResults, describeParkFeature, formatParkName, parkLabelPoint } from "@/lib/parks";
import { PARK_PHOTOS, photosForPark, validateParkPhotos } from "@/lib/park-photos";

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

function coordinates(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  if (typeof value[0] === "number") return [value as number[]];
  return value.flatMap(coordinates);
}

describe("parks geometry", () => {
  test("contains valid Singapore recreation features", () => {
    for (const feature of PARKS_GEOJSON.features) {
      expect(["park", "pcn", "trail"]).toContain(feature.properties.kind);
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

describe("formatParkName", () => {
  test("expands NParks abbreviations and title-cases all-caps names", () => {
    expect(formatParkName("ADMIRALTY PK")).toBe("Admiralty Park");
    expect(formatParkName("ISLAND GDNS WALK PG")).toBe("Island Gardens Walk Playground");
    expect(formatParkName("ANG MO KIO AVE 1 (CTE TO UPPER THOMSON)")).toBe("Ang Mo Kio Avenue 1 (CTE to Upper Thomson)");
    expect(formatParkName("ARMENIAN STREET (FCP)")).toBe("Armenian Street (FCP)");
    expect(formatParkName("PEARL'S HILL CITY PK")).toBe("Pearl's Hill City Park");
  });

  test("only expands abbreviations in already mixed-case names", () => {
    expect(formatParkName("Bukit Timah PC (btwn King Albert Park - Adam Rd)")).toBe(
      "Bukit Timah Park Connector (between King Albert Park - Adam Road)",
    );
    expect(formatParkName("Whampoa Park Connector")).toBe("Whampoa Park Connector");
  });
});

describe("areaHectares", () => {
  test("measures polygons minus holes, and ignores lines", () => {
    // ~100 m × ~100 m square near Singapore is ~1 ha.
    const square = [[103.8, 1.3], [103.8009, 1.3], [103.8009, 1.3009], [103.8, 1.3009], [103.8, 1.3]];
    const hole = [[103.8003, 1.3003], [103.8006, 1.3003], [103.8006, 1.3006], [103.8003, 1.3006], [103.8003, 1.3003]];
    expect(areaHectares({ type: "Polygon", coordinates: [square] })).toBeCloseTo(0.99, 1);
    expect(areaHectares({ type: "Polygon", coordinates: [square, hole] })).toBeCloseTo(0.88, 1);
    expect(areaHectares({ type: "LineString", coordinates: square })).toBe(0);
  });

  test("gives the bundled nature reserves a realistic size", () => {
    const reserve = PARKS_GEOJSON.features.find((f) => f.properties.name === "Central Catchment Nature Reserve");
    expect(reserve?.properties.areaHa).toBeGreaterThan(2000);
    expect(PARKS_GEOJSON.features.some((f) => / PK$| PG$/.test(f.properties.name))).toBe(false);
  });
});

describe("describeParkFeature", () => {
  test("explains each kind in plain words", () => {
    expect(texts(describeParkFeature({ kind: "park", name: "Bishan-Ang Mo Kio Park", areaHa: 62.4 }))).toEqual([
      "Bishan-Ang Mo Kio Park",
      "Public park or nature area",
      "About 62 ha",
      "Source: NParks via data.gov.sg",
    ]);
    expect(texts(describeParkFeature({ kind: "pcn", name: "Kallang Park Connector" }))[1]).toBe("Walking, running and cycling path");
    expect(texts(describeParkFeature({ kind: "trail", name: "Rock Path", park: "MacRitchie", type: "Boardwalk/Trail", cycle: false }))).toEqual([
      "Rock Path",
      "Walking only",
      "Boardwalk/Trail",
      "In MacRitchie",
      "Source: NParks via data.gov.sg",
    ]);
  });
});

describe("buildParkSearchResults", () => {
  test("lists each park area once, zooming out for big parks", () => {
    const results = buildParkSearchResults(PARKS_GEOJSON);
    expect(results.length).toBe(PARKS_GEOJSON.features.filter((f) => f.properties.kind === "park").length);
    expect(results.every((r) => r.type === "park" && r.lat > 1.1 && r.lat < 1.5)).toBe(true);
    expect(results.find((r) => r.name === "Central Catchment Nature Reserve")?.zoom).toBe(13.5);
  });
});

describe("parkLabelPoint", () => {
  test("uses the centre when it is inside, else a boundary point", () => {
    const square = [[103.8, 1.3], [103.81, 1.3], [103.81, 1.31], [103.8, 1.31], [103.8, 1.3]];
    const [lng, lat] = parkLabelPoint({ type: "Polygon", coordinates: [square] }) ?? [];
    expect(lng).toBeCloseTo(103.805, 6);
    expect(lat).toBeCloseTo(1.305, 6);
    // An L shape whose bbox centre falls in the missing corner.
    const ell = [[103.8, 1.3], [103.81, 1.3], [103.81, 1.301], [103.801, 1.301], [103.801, 1.31], [103.8, 1.31], [103.8, 1.3]];
    expect(parkLabelPoint({ type: "Polygon", coordinates: [ell] })).toEqual([103.801, 1.301]);
  });

  test("gives every park exactly one label", () => {
    const parks = PARKS_GEOJSON.features.filter((f) => f.properties.kind === "park");
    expect(PARK_LABELS_GEOJSON.features).toHaveLength(parks.length);
  });
});

describe("park photos", () => {
  const parkNames = new Set(PARKS_GEOJSON.features.filter((f) => f.properties.kind === "park").map((f) => f.properties.name));

  test("cover the big parks, keyed by display name, with credited Commons files", () => {
    expect(PARK_PHOTOS.size).toBeGreaterThan(50);
    for (const [name, photos] of PARK_PHOTOS) {
      expect(parkNames.has(name)).toBe(true);
      expect(photos.length).toBeGreaterThan(0);
      expect(photos.length).toBeLessThanOrEqual(3);
      for (const photo of photos) {
        expect(photo.source).toBe("commons");
        expect(photo.thumb).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
        expect(photo.thumb).not.toContain("utm_");
        expect(photo.license?.length).toBeGreaterThan(0);
      }
    }
    expect(photosForPark("Central Catchment Nature Reserve").length).toBeGreaterThan(0);
  });

  test("share photos across a split park and leave playgrounds empty", () => {
    expect(photosForPark("East Coast Park Area C").map((p) => p.thumb)).toEqual(photosForPark("East Coast Park Area D").map((p) => p.thumb));
    expect(photosForPark("Not A Real Playground")).toEqual([]);
  });

  test("keeps files reviewed as showing the wrong place out", () => {
    const pages = [...PARK_PHOTOS.values()].flat().map((photo) => photo.page ?? "");
    for (const bad of ["ChineseGardenSingapore-bridge-pagoda", "Former_Merlion_Park", "HK_Lakeside_Garden", "Marsiling_Park_Connector"]) {
      expect(pages.some((page) => page.includes(bad))).toBe(false);
    }
    expect(PARK_PHOTOS.has("Bukit Canberra")).toBe(false);
  });

  test("rejects photos from other hosts", () => {
    const photo = { thumb: "https://evil.example/a.jpg", page: null, author: "x", license: "CC0", source: "commons" };
    expect(validateParkPhotos({ "Some Park": [photo] })).toBe(false);
    expect(validateParkPhotos([])).toBe(false);
  });

  test("credits the photos in the popup", () => {
    const photo = { thumb: "https://thumb.wikimedia.org/a.jpg", page: null, author: "Terence Ong", license: "CC BY 2.5", source: "commons" as const };
    expect(texts(describeParkFeature({ kind: "park", name: "Kent Ridge Park", photos: [photo] }))).toContain("Photo: Terence Ong (CC BY 2.5) · Wikimedia Commons");
    expect(texts(describeParkFeature({ kind: "park", name: "Kent Ridge Park", photos: [] })).some((text) => text.startsWith("Photo"))).toBe(false);
  });
});
