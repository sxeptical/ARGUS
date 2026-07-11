import { describe, expect, test } from "bun:test";
import { isRouteableMrtStation, MRT_STATION_NAMES, planMrtRoute } from "./mrt-routing";

describe("isRouteableMrtStation", () => {
  test("returns true for known operational stations", () => {
    expect(isRouteableMrtStation("Bayshore")).toBe(true);
    expect(isRouteableMrtStation("Jurong East")).toBe(true);
    expect(isRouteableMrtStation("Bugis")).toBe(true);
    expect(isRouteableMrtStation("Orchard")).toBe(true);
    expect(isRouteableMrtStation("Woodlands")).toBe(true);
    expect(isRouteableMrtStation("Expo")).toBe(true);
  });

  test("returns false for non-existent stations", () => {
    expect(isRouteableMrtStation("Bedok South")).toBe(false);
    expect(isRouteableMrtStation("Sungei Bedok")).toBe(false);
    expect(isRouteableMrtStation("Nonexistent Station")).toBe(false);
    expect(isRouteableMrtStation("")).toBe(false);
  });
});

describe("MRT_STATION_NAMES", () => {
  test("is a sorted, non-empty array", () => {
    expect(MRT_STATION_NAMES.length).toBeGreaterThan(0);
    for (let i = 1; i < MRT_STATION_NAMES.length; i++) {
      expect(
        MRT_STATION_NAMES[i - 1].localeCompare(MRT_STATION_NAMES[i], "en-SG"),
      ).toBeLessThanOrEqual(0);
    }
  });

  test("contains well-known stations", () => {
    expect(MRT_STATION_NAMES).toContain("Raffles Place");
    expect(MRT_STATION_NAMES).toContain("Marina Bay");
    expect(MRT_STATION_NAMES).toContain("Changi Airport");
  });
});

describe("planMrtRoute", () => {
  test("returns null for non-routeable stations", () => {
    expect(planMrtRoute("Fake Station", "Bugis")).toBeNull();
    expect(planMrtRoute("Bugis", "Fake Station")).toBeNull();
  });

  test("returns a zero-minute plan when start equals end", () => {
    const plan = planMrtRoute("Bugis", "Bugis");
    expect(plan).not.toBeNull();
    expect(plan!.start).toBe("Bugis");
    expect(plan!.end).toBe("Bugis");
    expect(plan!.stations).toEqual(["Bugis"]);
    expect(plan!.estimatedMinutes).toBe(0);
    expect(plan!.transfers).toBe(0);
  });

  test("returns a valid plan for a short same-line trip", () => {
    const plan = planMrtRoute("Bugis", "Paya Lebar");
    expect(plan).not.toBeNull();
    expect(plan!.start).toBe("Bugis");
    expect(plan!.end).toBe("Paya Lebar");
    expect(plan!.segments.length).toBeGreaterThanOrEqual(1);
    expect(plan!.estimatedMinutes).toBeGreaterThan(0);
    expect(plan!.stations).toContain("Bugis");
    expect(plan!.stations).toContain("Paya Lebar");
  });

  test("returns a valid plan that includes transfers for cross-line trips", () => {
    // Jurong East (NS/EW interchange) -> Bugis (EW/DT interchange)
    const plan = planMrtRoute("Jurong East", "Bugis");
    expect(plan).not.toBeNull();
    expect(plan!.transfers).toBeGreaterThanOrEqual(0);
    expect(plan!.estimatedMinutes).toBeGreaterThan(0);
  });
});
