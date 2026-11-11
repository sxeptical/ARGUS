import { describe, expect, test } from "bun:test";
import { HEALTHCARE_SITES, validateHealthcareBundle } from "@/lib/data/healthcare";
import { describeHealthcare } from "@/lib/healthcare";
import type { HealthcareSite } from "@/types";

const site = (overrides: Partial<HealthcareSite> = {}): HealthcareSite => ({
  id: "chas-15M0211",
  name: "Acumed Medical Group",
  kind: "gp",
  address: "1 Joo Koon Circle, Fairprice Hub, Singapore 629117",
  phone: "+65 6861 5755",
  programmes: ["CDMP", "CHAS"],
  lat: 1.325618,
  lng: 103.67841,
  photos: [],
  source: "chas",
  ...overrides,
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("healthcare bundle", () => {
  test("ships plausible Singapore GP clinics, hospitals and dental clinics", () => {
    expect(HEALTHCARE_SITES.length).toBeGreaterThan(1400);
    for (const place of HEALTHCARE_SITES) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(HEALTHCARE_SITES.map((s) => s.id)).size).toBe(HEALTHCARE_SITES.length);
    expect(HEALTHCARE_SITES.some((s) => s.kind === "gp" && s.source === "chas")).toBe(true);
    expect(HEALTHCARE_SITES.some((s) => s.kind === "hospital")).toBe(true);
    expect(HEALTHCARE_SITES.some((s) => s.kind === "dental")).toBe(true);
    expect(HEALTHCARE_SITES.every((s) => s.kind !== "hospital" || s.photos.length <= 3)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateHealthcareBundle([site()])).toBe(true);
    expect(validateHealthcareBundle({ sites: [site()] })).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), kind: "clinic" }])).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), source: "unknown" }])).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), id: "" }])).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), name: "" }])).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), programmes: "CHAS" }])).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), lat: Number.NaN }])).toBe(false);
  });
});

describe("describeHealthcare", () => {
  test("shows the kind, schemes, phone, address, and 2021 CHAS attribution", () => {
    expect(texts(describeHealthcare(site()))).toEqual([
      "Acumed Medical Group",
      "GP clinic",
      "Schemes: CDMP · CHAS",
      "Tel +65 6861 5755",
      "1 Joo Koon Circle, Fairprice Hub, Singapore 629117",
      "Source: MOH CHAS Clinics via data.gov.sg (Singapore Open Data Licence) · data as of 2021",
    ]);
  });

  test("attributes OSM hospitals without schemes", () => {
    expect(texts(describeHealthcare(site({
      id: "osm-node-1",
      name: "Tan Tock Seng Hospital",
      kind: "hospital",
      address: null,
      phone: null,
      programmes: [],
      source: "osm",
    })))).toEqual([
      "Tan Tock Seng Hospital",
      "Hospital",
      "Location: © OpenStreetMap contributors (ODbL)",
    ]);
  });
});
