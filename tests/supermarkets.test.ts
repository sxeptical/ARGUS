import { describe, expect, test } from "bun:test";
import { SUPERMARKET_BRANDS, SUPERMARKETS, validateSupermarketsBundle } from "@/lib/supermarkets-data";
import { buildSupermarketSearchResults, describeSupermarket, filterSupermarketsByBrand, orderedSupermarketBrandCounts, supermarketBrandCounts } from "@/lib/supermarkets";
import type { Supermarket, SupermarketBrand } from "@/types";

const market = (overrides: Partial<Supermarket> = {}): Supermarket => ({
  id: "osm-node-1397867188",
  name: "FairPrice",
  brand: "NTUC FairPrice",
  address: "1 Rivervale Crescent, Singapore 545082",
  lat: 1.39221,
  lng: 103.90445,
  openingHours: "24/7",
  website: null,
  ...overrides,
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("supermarkets bundle", () => {
  test("ships plausible Singapore supermarkets", () => {
    expect(SUPERMARKETS.length).toBeGreaterThan(540);
    for (const place of SUPERMARKETS) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(SUPERMARKETS.map((m) => m.id)).size).toBe(SUPERMARKETS.length);
    expect(SUPERMARKETS.some((m) => m.brand === "NTUC FairPrice")).toBe(true);
    expect(SUPERMARKETS.some((m) => m.brand === "Other")).toBe(true);
  });

  test("normalises every supermarket to a known operator brand", () => {
    const known = new Set(SUPERMARKET_BRANDS);
    for (const place of SUPERMARKETS) expect(known.has(place.brand)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateSupermarketsBundle([market()])).toBe(true);
    expect(validateSupermarketsBundle({ markets: [market()] })).toBe(false);
    expect(validateSupermarketsBundle([{ ...market(), brand: "Giant Hypermarket" }])).toBe(false);
    expect(validateSupermarketsBundle([{ ...market(), brand: null }])).toBe(false);
    expect(validateSupermarketsBundle([{ ...market(), id: "" }])).toBe(false);
    expect(validateSupermarketsBundle([{ ...market(), name: "" }])).toBe(false);
    expect(validateSupermarketsBundle([{ ...market(), lat: Number.NaN }])).toBe(false);
  });
});

describe("describeSupermarket", () => {
  test("shows the brand, hours, address, and OSM source", () => {
    expect(texts(describeSupermarket(market()))).toEqual([
      "FairPrice",
      "NTUC FairPrice supermarket",
      "Open 24 hours",
      "1 Rivervale Crescent, Singapore 545082",
      "Location: © OpenStreetMap contributors (ODbL)",
    ]);
  });

  test("shows the generic type for Other and name-identical brands", () => {
    expect(texts(describeSupermarket(market({ name: "Fortune Supermarket", brand: "Other", openingHours: null, address: null })))).toEqual([
      "Fortune Supermarket",
      "Supermarket",
      "Location: © OpenStreetMap contributors (ODbL)",
    ]);
    expect(texts(describeSupermarket(market({ name: "Sheng Siong", brand: "Sheng Siong" })))[1]).toBe("Supermarket");
  });
});

describe("supermarket brand filtering", () => {
  test("keeps only supermarkets whose brand is on", () => {
    const markets = [market(), market({ id: "osm-1", brand: "Other", name: "Fortune Supermarket" })];
    const record: Record<SupermarketBrand, boolean> = Object.fromEntries(
      SUPERMARKET_BRANDS.map((brand) => [brand, brand !== "NTUC FairPrice"]),
    ) as Record<SupermarketBrand, boolean>;
    expect(filterSupermarketsByBrand(markets, record).map((m) => m.id)).toEqual(["osm-1"]);
    expect(filterSupermarketsByBrand(markets, {})).toHaveLength(2);
  });

  test("counts brands biggest first with Other last", () => {
    const markets = [
      market({ id: "a", brand: "Sheng Siong" }),
      market({ id: "b", brand: "Sheng Siong" }),
      market({ id: "c", brand: "Other" }),
      market({ id: "d", brand: "Other" }),
      market({ id: "e", brand: "Other" }),
      market({ id: "f", brand: "Giant" }),
    ];
    expect(supermarketBrandCounts(markets)).toEqual([
      { brand: "Other", count: 3 },
      { brand: "Sheng Siong", count: 2 },
      { brand: "Giant", count: 1 },
    ]);
    expect(orderedSupermarketBrandCounts(markets).map((entry) => entry.brand)).toEqual([
      "Sheng Siong",
      "Giant",
      "Other",
    ]);
  });
});

describe("supermarket search results", () => {
  test("lands on the place with a searchable type", () => {
    expect(buildSupermarketSearchResults([market()])[0]).toMatchObject({ id: "osm-node-1397867188", type: "supermarket", lat: 1.39221, lng: 103.90445, zoom: 16 });
    expect(buildSupermarketSearchResults([market()])[0].keywords).toContain("supermarket");
    expect(buildSupermarketSearchResults([market()])[0].keywords).toContain("NTUC FairPrice");
  });
});
