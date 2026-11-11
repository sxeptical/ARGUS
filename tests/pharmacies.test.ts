import { describe, expect, test } from "bun:test";
import { validatePharmaciesBundle } from "@/lib/data/pharmacies";
import { describePharmacy } from "@/lib/pharmacies";
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
  test("rejects malformed bundles", () => {
    expect(validatePharmaciesBundle([pharmacy()])).toBe(true);
    expect(validatePharmaciesBundle({ pharmacies: [pharmacy()] })).toBe(false);
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
