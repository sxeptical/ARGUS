import { describe, expect, test } from "bun:test";
import { PHARMACIES, validatePharmaciesBundle } from "@/lib/pharmacies-data";
import { buildPharmacySearchResults, describePharmacy } from "@/lib/pharmacies";
import type { Pharmacy } from "@/types";

const pharmacy = (overrides: Partial<Pharmacy> = {}): Pharmacy => ({
  id: "pharmacy-2779",
  name: "Watson's Personal Care Stores Pte Ltd (Bugis Junction)",
  address: "200 Victoria Street, #02-29 TO 33/33A, Singapore 188021",
  lat: 1.2991,
  lng: 103.8554,
  ...overrides,
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("pharmacies bundle", () => {
  test("ships plausible Singapore retail pharmacies", () => {
    expect(PHARMACIES.length).toBeGreaterThan(200);
    for (const place of PHARMACIES) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(PHARMACIES.map((p) => p.id)).size).toBe(PHARMACIES.length);
  });

  test("rejects malformed bundles", () => {
    expect(validatePharmaciesBundle([pharmacy()])).toBe(true);
    expect(validatePharmaciesBundle({ pharmacies: [pharmacy()] })).toBe(false);
    expect(validatePharmaciesBundle([{ ...pharmacy(), id: "" }])).toBe(false);
    expect(validatePharmaciesBundle([{ ...pharmacy(), name: "" }])).toBe(false);
    expect(validatePharmaciesBundle([{ ...pharmacy(), lat: Number.NaN }])).toBe(false);
  });
});

describe("describePharmacy", () => {
  test("shows the address and source", () => {
    expect(texts(describePharmacy(pharmacy()))).toEqual([
      "Watson's Personal Care Stores Pte Ltd (Bugis Junction)",
      "Retail pharmacy",
      "200 Victoria Street, #02-29 TO 33/33A, Singapore 188021",
      "Source: HSA via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });

  test("omits the address line when there is none", () => {
    expect(texts(describePharmacy(pharmacy({ address: null })))).toEqual([
      "Watson's Personal Care Stores Pte Ltd (Bugis Junction)",
      "Retail pharmacy",
      "Source: HSA via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });
});

describe("pharmacy search results", () => {
  test("lands on the place with a searchable type", () => {
    expect(buildPharmacySearchResults([pharmacy()])[0]).toMatchObject({ id: "pharmacy-2779", type: "pharmacy", lat: 1.2991, lng: 103.8554, zoom: 16 });
    expect(buildPharmacySearchResults([pharmacy()])[0].keywords).toContain("pharmacy");
    expect(buildPharmacySearchResults([pharmacy()])[0].keywords).toContain("chemist");
  });
});
