import { describe, expect, test } from "bun:test";
import { SUPERMARKETS, validateSupermarketsBundle } from "@/lib/data/supermarkets";
import { describeSupermarket } from "@/lib/supermarkets";
import { SUPERMARKET_BRANDS, type Supermarket } from "@/types";

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
  test("ships the major and independent brands", () => {
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
