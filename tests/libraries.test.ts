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
  test("ships both NLB and OSM branches", () => {
    expect(LIBRARIES.some((l) => l.source === "nlb")).toBe(true);
    expect(LIBRARIES.some((l) => l.source === "osm")).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateLibrariesBundle([library()])).toBe(true);
    expect(validateLibrariesBundle({ libraries: [library()] })).toBe(false);
    expect(validateLibrariesBundle([{ ...library(), source: "unknown" }])).toBe(false);
    expect(validateLibrariesBundle([{ ...library(), branch: 7 }])).toBe(false);
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
