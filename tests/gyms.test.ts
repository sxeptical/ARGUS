import { describe, expect, test } from "bun:test";
import { GYM_BRANDS, GYMS, validateGymsBundle } from "@/lib/gyms-data";
import { buildGymSearchResults, describeGym, filterGymsByBrand, gymBrandCounts, orderedGymBrandCounts } from "@/lib/gyms";
import type { Gym, GymBrand } from "@/types";

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

  test("normalises every gym to a known operator brand", () => {
    const known = new Set(GYM_BRANDS);
    for (const place of GYMS) expect(known.has(place.brand)).toBe(true);
    expect(GYMS.some((g) => g.brand === "ActiveSG")).toBe(true);
    expect(GYMS.some((g) => g.brand === "Anytime Fitness")).toBe(true);
    expect(GYMS.some((g) => g.brand === "Independent")).toBe(true);
  });

  // Regression guard for the Nov 2026 ActiveSG directory gap: every gym in
  // ActiveSG's official list (activesg.gov.sg/gym-pool-crowd) is on the map,
  // and Sport Centres with no gym (or closed ones) are not shown as gyms.
  // Gyms whose SportSG venue name hides the gym (swimming complexes,
  // Hockey Village, Teck Ghee) and Punggol (not in the dataset) are the
  // formerly missing ones.
  test("covers the official ActiveSG gym list, not stale Sport Centres", () => {
    const activeSg = new Set(GYMS.filter((g) => g.brand === "ActiveSG").map((g) => g.name));
    for (const name of [
      "Katong ActiveSG Gym",
      "Punggol ActiveSG Gym",
      "ActiveSG Sport Park @ Teck Ghee Gym",
      "ActiveSG Hockey Village @ Boon Lay Gym",
      "Bukit Batok ActiveSG Gym",
      "ActiveSG Gym@Ang Mo Kio Community Centre",
      "ActiveSG Gym@Enabling Village",
      "ActiveSG Gym@Fernvale Square",
      "ActiveSG Gym@Serangoon Central",
      "ActiveSG Gym@Toa Payoh",
      "ActiveSG Gym@Toa Payoh West Community Centre",
    ]) {
      expect(activeSg.has(name)).toBe(true);
    }
    for (const name of [
      // No gym at these Sport Centres (checked against the directory).
      "Kallang Sport Centre",
      "Serangoon Sport Centre",
      // Closed for redevelopment / lease expiry.
      "Toa Payoh Sport Centre",
      "St. Wilfred Sport Centre",
    ]) {
      expect(activeSg.has(name)).toBe(false);
    }
  });

  test("rejects malformed bundles", () => {
    expect(validateGymsBundle([gym()])).toBe(true);
    expect(validateGymsBundle({ gyms: [gym()] })).toBe(false);
    expect(validateGymsBundle([{ ...gym(), category: "spa" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), source: "unknown" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), brand: "SportSG" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), brand: null }])).toBe(false);
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

  test("shows the category alone for independent gyms and brand-named places", () => {
    expect(texts(describeGym(gym({ name: "Bukit Merah Boxing Club", brand: "Independent", openingHours: null, address: null, source: "osm" })))).toEqual([
      "Bukit Merah Boxing Club",
      "Gym",
      "Location: © OpenStreetMap contributors (ODbL)",
    ]);
    expect(describeGym(gym({ name: "Anytime Fitness", brand: "Anytime Fitness", openingHours: null, address: null, source: "osm" }))).toEqual([
      { text: "Anytime Fitness", kind: "name" },
      { text: "Gym", kind: "status", tone: "muted" },
      { text: "Location: © OpenStreetMap contributors (ODbL)", kind: "hint" },
    ]);
  });

  test("attributes public SportSG gyms", () => {
    expect(texts(describeGym(gym({ name: "Bukit Canberra Sport Centre", brand: "ActiveSG", category: "public", openingHours: null, source: "sportsg" })))).toContain("Source: SportSG via data.gov.sg (Singapore Open Data Licence)");
  });
});

describe("gym brand filtering", () => {
  const brands = (overrides: Partial<Record<GymBrand, boolean>>): Record<GymBrand, boolean> =>
    Object.fromEntries(GYM_BRANDS.map((brand) => [brand, overrides[brand] ?? true])) as Record<GymBrand, boolean>;

  test("keeps only gyms whose brand is on", () => {
    const gyms = [gym(), gym({ id: "osm-1", brand: "Independent", name: "Some Club" })];
    expect(filterGymsByBrand(gyms, brands({ "Anytime Fitness": false })).map((g) => g.id)).toEqual(["osm-1"]);
    expect(filterGymsByBrand(gyms, {})).toHaveLength(2);
  });

  test("counts brands biggest first", () => {
    const gyms = [
      gym({ id: "a", brand: "Anytime Fitness" }),
      gym({ id: "b", brand: "Anytime Fitness" }),
      gym({ id: "c", brand: "Independent" }),
      gym({ id: "d", brand: "ActiveSG" }),
    ];
    expect(gymBrandCounts(gyms)).toEqual([
      { brand: "Anytime Fitness", count: 2 },
      { brand: "ActiveSG", count: 1 },
      { brand: "Independent", count: 1 },
    ]);
    expect(orderedGymBrandCounts(gyms).map((entry) => entry.brand)).toEqual([
      "ActiveSG",
      "Anytime Fitness",
      "Independent",
    ]);
  });
});

describe("gym search results", () => {
  test("lands on the place with a searchable type", () => {
    expect(buildGymSearchResults([gym()])[0]).toMatchObject({ id: "atp-anytime_fitness-SG-0012", type: "gym", lat: 1.36134, lng: 103.84155, zoom: 16 });
    expect(buildGymSearchResults([gym()])[0].keywords).toContain("gym");
    expect(buildGymSearchResults([gym()])[0].keywords).toContain("Anytime Fitness");
  });
});
