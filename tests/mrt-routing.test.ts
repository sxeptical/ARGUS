import { describe, expect, test } from "bun:test";
import { isRouteableMrtStation, MRT_STATION_NAMES, planMrtRoute } from "@/lib/mrt-routing";

describe("isRouteableMrtStation", () => {
  test("returns true for known operational stations", () => {
    expect(isRouteableMrtStation("Jurong East")).toBe(true);
    expect(isRouteableMrtStation("Hume")).toBe(true);
    expect(isRouteableMrtStation("Prince Edward Road")).toBe(true);
  });

  test("returns false for non-existent stations", () => {
    expect(isRouteableMrtStation("Nonexistent Station")).toBe(false);
    expect(isRouteableMrtStation("")).toBe(false);
  });
});

describe("MRT_STATION_NAMES", () => {
  test("is a sorted, non-empty list that contains the well-known stations", () => {
    expect(MRT_STATION_NAMES.length).toBeGreaterThan(0);
    for (let i = 1; i < MRT_STATION_NAMES.length; i++) {
      expect(
        MRT_STATION_NAMES[i - 1].localeCompare(MRT_STATION_NAMES[i], "en-SG"),
      ).toBeLessThanOrEqual(0);
    }
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

  test("rides through Hume between Hillview and Beauty World", () => {
    expect(planMrtRoute("Hillview", "Beauty World")?.stations).toEqual(["Hillview", "Hume", "Beauty World"]);
    expect(planMrtRoute("Bugis", "Paya Lebar")).toMatchObject({ start: "Bugis", end: "Paya Lebar", transfers: 0 });
  });
});

describe("LRT routing", () => {
  test("rides a loop through its interchange without a transfer", () => {
    const route = planMrtRoute("Ranggung", "Compassvale");
    expect(route?.transfers).toBe(0);
    expect(route?.segments).toEqual([
      { line: "Sengkang LRT East Loop", from: "Ranggung", to: "Compassvale", stops: 2, stations: ["Ranggung", "Sengkang", "Compassvale"] },
    ]);
  });

  test("takes the short way round the Bukit Panjang loop", () => {
    const route = planMrtRoute("Senja", "Bukit Panjang");
    expect(route?.segments).toEqual([
      { line: "Bukit Panjang LRT", from: "Senja", to: "Bukit Panjang", stops: 1, stations: ["Senja", "Bukit Panjang"] },
    ]);
  });

  test("changes between loops and MRT at the interchange", () => {
    const route = planMrtRoute("Renjong", "Kovan");
    expect(route?.segments.map((segment) => segment.line)).toEqual(["Sengkang LRT West Loop", "North East Line"]);
    expect(route?.segments[0].to).toBe("Sengkang");
    expect(route?.transfers).toBe(1);
  });
});
