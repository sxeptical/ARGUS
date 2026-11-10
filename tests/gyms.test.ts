import { describe, expect, test } from "bun:test";
import { GYMS, validateGymsBundle } from "@/lib/gyms-data";
import { buildGymSearchResults, describeGym } from "@/lib/gyms";
import type { Gym } from "@/types";

const gym = (overrides: Partial<Gym> = {}): Gym => ({
  id: "atp-anytime_fitness-SG-0012",
  name: "Marymount CC",
  brand: "Anytime Fitness",
  category: "gym",
  address: "191 Sin Ming Avenue, #03-01, Singapore 575738",
  lat: 1.36134,
  lng: 103.84155,
  openingHours: "24/7",
  website: "https://anytimefitness.sg/gyms/sg-0012/marymount-community-club-south-west-575738/",
  source: "alltheplaces",
  ...overrides,
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("gyms bundle", () => {
  test("ships plausible Singapore gyms from all three sources", () => {
    expect(GYMS.length).toBeGreaterThan(300);
    for (const place of GYMS) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(GYMS.map((g) => g.id)).size).toBe(GYMS.length);
    expect(GYMS.some((g) => g.source === "alltheplaces")).toBe(true);
    expect(GYMS.some((g) => g.source === "osm")).toBe(true);
    expect(GYMS.some((g) => g.source === "sportsg")).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateGymsBundle([gym()])).toBe(true);
    expect(validateGymsBundle({ gyms: [gym()] })).toBe(false);
    expect(validateGymsBundle([{ ...gym(), category: "spa" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), source: "unknown" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), id: "" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), name: "" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), lat: Number.NaN }])).toBe(false);
  });
});

describe("describeGym", () => {
  test("shows brand, category, hours, address, and source", () => {
    expect(texts(describeGym(gym()))).toEqual([
      "Marymount CC",
      "Anytime Fitness · Gym",
      "Open 24 hours",
      "191 Sin Ming Avenue, #03-01, Singapore 575738",
      "Source: All The Places (CC0)",
    ]);
  });

  test("shows the category alone when the brand repeats the name", () => {
    expect(describeGym(gym({ name: "Anytime Fitness", brand: "Anytime Fitness", openingHours: null, address: null, source: "osm" }))).toEqual([
      { text: "Anytime Fitness", kind: "name" },
      { text: "Gym", kind: "status", tone: "muted" },
      { text: "Location: © OpenStreetMap contributors (ODbL)", kind: "hint" },
    ]);
  });

  test("attributes public SportSG gyms", () => {
    expect(texts(describeGym(gym({ name: "Bukit Canberra Sport Centre", brand: "SportSG", category: "public", openingHours: null, source: "sportsg" })))).toContain("Source: SportSG via data.gov.sg (Singapore Open Data Licence)");
  });
});

describe("gym search results", () => {
  test("lands on the place with a searchable type", () => {
    expect(buildGymSearchResults([gym()])[0]).toMatchObject({ id: "atp-anytime_fitness-SG-0012", type: "gym", lat: 1.36134, lng: 103.84155, zoom: 16 });
    expect(buildGymSearchResults([gym()])[0].keywords).toContain("gym");
    expect(buildGymSearchResults([gym()])[0].keywords).toContain("Anytime Fitness");
  });
});
