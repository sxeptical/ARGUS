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
  test("ships GPs, hospitals and dental clinics", () => {
    expect(HEALTHCARE_SITES.some((s) => s.kind === "gp" && s.source === "chas")).toBe(true);
    expect(HEALTHCARE_SITES.some((s) => s.kind === "hospital")).toBe(true);
    expect(HEALTHCARE_SITES.some((s) => s.kind === "dental")).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateHealthcareBundle([site()])).toBe(true);
    expect(validateHealthcareBundle({ sites: [site()] })).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), kind: "clinic" }])).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), source: "unknown" }])).toBe(false);
    expect(validateHealthcareBundle([{ ...site(), programmes: "CHAS" }])).toBe(false);
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
