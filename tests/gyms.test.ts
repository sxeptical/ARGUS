import { describe, expect, test } from "bun:test";
import { AMENITY_SEARCH_RESULTS } from "@/lib/amenity-layers";
import { GYMS, validateGymsBundle } from "@/lib/data/gyms";
import { describeGym } from "@/lib/gyms";
import { GYM_BRANDS, type Gym } from "@/types";

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
  // ActiveSG's official list (activesgcircle.gov.sg/facilities/gyms) is on
  // the map under its official display name, and Sport Centres with no gym
  // (or closed ones) are not shown as gyms. Gyms whose SportSG venue name
  // hides the gym (swimming complexes, Hockey Village, Teck Ghee) and
  // Punggol (not in the dataset) are the formerly missing ones. Sport Centres
  // use the directory's "<Place> ActiveSG Gym" form (the dataset's "Sport
  // Centre" suffix), including the user-reported "Heartbeat @ Bedok" and
  // "Tampines" (at Our Tampines Hub) gyms; the dataset venue string stays
  // reachable as a search alias ("Tampines Sport Centre", "OTH").
  test("covers the official ActiveSG gym list, not stale Sport Centres", () => {
    const activeSg = new Set(GYMS.filter((g) => g.brand === "ActiveSG").map((g) => g.name));
    for (const name of [
      "Katong ActiveSG Gym",
      "Punggol ActiveSG Gym",
      "ActiveSG Sport Park @ Teck Ghee Gym",
      "ActiveSG Hockey Village @ Boon Lay Gym",
      "Bukit Batok ActiveSG Gym",
      "ActiveSG Gym @ Ang Mo Kio Community Centre",
      "ActiveSG Gym @ Enabling Village",
      "ActiveSG Gym @ Fernvale Square",
      "ActiveSG Gym @ Serangoon Central",
      "ActiveSG Gym @ Toa Payoh",
      "ActiveSG Gym @ Toa Payoh West Community Centre",
      "Heartbeat @ Bedok ActiveSG Gym",
      "Tampines ActiveSG Gym",
      "Bishan ActiveSG Gym",
      "Bukit Canberra ActiveSG Gym",
      "Woodlands ActiveSG Gym",
    ]) {
      expect(activeSg.has(name)).toBe(true);
    }
    expect(activeSg.size).toBe(31);
    for (const name of [
      // No gym at these Sport Centres (checked against the directory).
      "Kallang Sport Centre",
      "Serangoon Sport Centre",
      // Closed for redevelopment / lease expiry.
      "Toa Payoh Sport Centre",
      "St. Wilfred Sport Centre",
      // Old dataset venue strings: kept only as search aliases now.
      "Tampines Sport Centre",
      "Heartbeat@Bedok ActiveSG Sport Centre",
      "ActiveSG Gym@Ang Mo Kio Community Centre",
    ]) {
      expect(activeSg.has(name)).toBe(false);
    }
    // Unbranded OSM "Tampines Gymnasium" was the same OTH gym; it dedupes
    // against the SportSG point within 100 m.
    expect(GYMS.some((g) => g.name === "Tampines Gymnasium")).toBe(false);
  });

  test("keeps venues searchable under official names and old labels", () => {
    const byName = new Map(GYMS.map((g) => [g.name, g]));
    expect(byName.get("Tampines ActiveSG Gym")).toMatchObject({
      address: "Level 7 Our Tampines Hub, 1 Tampines Walk, Singapore 528523",
      aliases: ["Tampines Sport Centre", "Our Tampines Hub", "OTH"],
    });
    expect(byName.get("Heartbeat @ Bedok ActiveSG Gym")).toMatchObject({
      address: "Level 6 Heartbeat@Bedok, 11 Bedok North Street 1, Singapore 469662",
      aliases: ["Heartbeat@Bedok ActiveSG Sport Centre"],
    });
    // Search keywords carry aliases so "OTH" / "Our Tampines Hub" find the gym.
    const tampines = AMENITY_SEARCH_RESULTS.find((result) => result.name === "Tampines ActiveSG Gym")!;
    for (const keyword of ["OTH", "Our Tampines Hub", "Tampines Sport Centre"]) {
      expect(tampines.keywords).toContain(keyword);
    }
  });

  test("rejects malformed bundles", () => {
    expect(validateGymsBundle([gym()])).toBe(true);
    expect(validateGymsBundle({ gyms: [gym()] })).toBe(false);
    expect(validateGymsBundle([{ ...gym(), category: "spa" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), source: "unknown" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), brand: "SportSG" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), brand: null }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), website: "javascript:alert(1)" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), website: "http://example.com" }])).toBe(true);
    expect(validateGymsBundle([{ ...gym(), website: null }])).toBe(true);
    expect(validateGymsBundle([{ ...gym(), aliases: "OTH" }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), aliases: [42] }])).toBe(false);
    expect(validateGymsBundle([{ ...gym(), aliases: ["OTH"] }])).toBe(true);
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
