import { describe, expect, test } from "bun:test";
import { LIBRARIES, validateLibrariesBundle } from "@/lib/data/libraries";
import { describeLibrary } from "@/lib/libraries";
import type { PublicLibrary } from "@/types";

const library = (overrides: Partial<PublicLibrary> = {}): PublicLibrary => ({
  id: "nlb-srpl",
  name: "Serangoon Public Library",
  branch: "SRPL",
  address: "23 Serangoon Central, NEX, #04, Singapore 556083",
  lat: 1.350727,
  lng: 103.872257,
  photos: [],
  source: "nlb",
  ...overrides,
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("libraries bundle", () => {
  test("ships plausible Singapore NLB and OSM branches", () => {
    expect(LIBRARIES.length).toBeGreaterThanOrEqual(28);
    for (const place of LIBRARIES) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(LIBRARIES.map((l) => l.id)).size).toBe(LIBRARIES.length);
    expect(LIBRARIES.some((l) => l.source === "nlb")).toBe(true);
    expect(LIBRARIES.some((l) => l.source === "osm")).toBe(true);
    expect(LIBRARIES.every((l) => l.photos.length <= 3)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateLibrariesBundle([library()])).toBe(true);
    expect(validateLibrariesBundle({ libraries: [library()] })).toBe(false);
    expect(validateLibrariesBundle([{ ...library(), id: "" }])).toBe(false);
    expect(validateLibrariesBundle([{ ...library(), name: "" }])).toBe(false);
    expect(validateLibrariesBundle([{ ...library(), source: "unknown" }])).toBe(false);
    expect(validateLibrariesBundle([{ ...library(), branch: 7 }])).toBe(false);
    expect(validateLibrariesBundle([{ ...library(), lat: Number.NaN }])).toBe(false);
  });
});

describe("describeLibrary", () => {
  test("shows the branch code, address, and 2019 NLB attribution", () => {
    expect(texts(describeLibrary(library()))).toEqual([
      "Serangoon Public Library",
      "Public library",
      "Branch SRPL",
      "23 Serangoon Central, NEX, #04, Singapore 556083",
      "Source: National Library Board via data.gov.sg (Singapore Open Data Licence) · data as of 2019",
    ]);
  });

  test("attributes OSM branches", () => {
    expect(texts(describeLibrary(library({ id: "osm-node-10102519901", name: "Punggol Regional Library", branch: null, address: null, source: "osm" })))).toEqual([
      "Punggol Regional Library",
      "Public library",
      "Location: © OpenStreetMap contributors (ODbL)",
    ]);
  });
});
