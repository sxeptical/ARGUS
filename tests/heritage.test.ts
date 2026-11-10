import { describe, expect, test } from "bun:test";
import { HERITAGE_SITES, validateHeritageBundle } from "@/lib/heritage-data";
import { buildHeritageSearchResults, describeHeritage, filterHeritageByKind, orderedHeritageKindCounts } from "@/lib/heritage";
import type { HeritageSite } from "@/types";

const site = (overrides: Partial<HeritageSite> = {}): HeritageSite => ({
  id: "heritage-historic-2333",
  name: "Fort Canning Command Centre",
  kind: "historic-site",
  address: "2 Cox Terrace, Singapore 179622",
  description: "The site where surrender was decided on 15 February 1942.",
  website: "https://www.roots.gov.sg/places/places-landing/Places/historic-sites/fort-canning-command-centre",
  lat: 1.295836,
  lng: 103.846397,
  photos: [],
  source: "nhb",
  ...overrides,
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("heritage bundle", () => {
  test("ships plausible Singapore NHB and museum sites", () => {
    expect(HERITAGE_SITES.length).toBeGreaterThan(240);
    for (const place of HERITAGE_SITES) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(HERITAGE_SITES.map((s) => s.id)).size).toBe(HERITAGE_SITES.length);
    expect(HERITAGE_SITES.some((s) => s.kind === "historic-site" && s.source === "nhb")).toBe(true);
    expect(HERITAGE_SITES.some((s) => s.kind === "monument")).toBe(true);
    expect(HERITAGE_SITES.some((s) => s.kind === "museum" && s.source === "osm")).toBe(true);
    expect(HERITAGE_SITES.every((s) => s.photos.length <= 3)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateHeritageBundle([site()])).toBe(true);
    expect(validateHeritageBundle({ sites: [site()] })).toBe(false);
    expect(validateHeritageBundle([{ ...site(), kind: "castle" }])).toBe(false);
    expect(validateHeritageBundle([{ ...site(), source: "unknown" }])).toBe(false);
    expect(validateHeritageBundle([{ ...site(), id: "" }])).toBe(false);
    expect(validateHeritageBundle([{ ...site(), name: "" }])).toBe(false);
    expect(validateHeritageBundle([{ ...site(), website: 42 }])).toBe(false);
    expect(validateHeritageBundle([{ ...site(), lat: Number.NaN }])).toBe(false);
  });
});

describe("describeHeritage", () => {
  test("shows the kind, blurb, address, and NHB source", () => {
    expect(texts(describeHeritage(site()))).toEqual([
      "Fort Canning Command Centre",
      "Historic site",
      "The site where surrender was decided on 15 February 1942.",
      "2 Cox Terrace, Singapore 179622",
      "Source: National Heritage Board via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });

  test("attributes OSM museums", () => {
    expect(texts(describeHeritage(site({
      id: "osm-node-1",
      name: "Mint Museum of Toys",
      kind: "museum",
      address: null,
      description: null,
      website: "https://emint.com/",
      source: "osm",
    })))).toEqual([
      "Mint Museum of Toys",
      "Museum",
      "Location: © OpenStreetMap contributors (ODbL)",
    ]);
  });
});

describe("heritage kind filtering", () => {
  test("keeps only sites whose kind is on", () => {
    const sites = [site(), site({ id: "osm-node-1", kind: "museum", name: "A Museum" })];
    expect(filterHeritageByKind(sites, { museum: false }).map((s) => s.id)).toEqual(["heritage-historic-2333"]);
    expect(filterHeritageByKind(sites, {})).toHaveLength(2);
  });

  test("counts kinds in display order", () => {
    const sites = [
      site({ id: "a", kind: "museum" }),
      site({ id: "b", kind: "monument" }),
      site({ id: "c", kind: "historic-site" }),
      site({ id: "d", kind: "historic-site" }),
    ];
    expect(orderedHeritageKindCounts(sites)).toEqual([
      { kind: "historic-site", count: 2 },
      { kind: "monument", count: 1 },
      { kind: "museum", count: 1 },
    ]);
  });
});

describe("heritage search results", () => {
  test("lands on the site with a searchable type", () => {
    expect(buildHeritageSearchResults([site()])[0]).toMatchObject({ id: "heritage-historic-2333", type: "heritage", lat: 1.295836, lng: 103.846397, zoom: 16 });
    expect(buildHeritageSearchResults([site()])[0].keywords).toContain("heritage");
    expect(buildHeritageSearchResults([site()])[0].keywords).toContain("Historic site");
  });
});
