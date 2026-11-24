import { describe, expect, test } from "bun:test";
import {
  isQuieterRoute,
  isRouteableMrtStation,
  MRT_STATION_NAMES,
  planMrtRoute,
} from "@/lib/mrt-routing";
import { mergeStationCrowds } from "@/lib/train-crowds";
import type { TrainCrowds, TrainServiceAlert } from "@/types";

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

describe("disruption-aware routing", () => {
  const alert = (
    affectedLines: string[],
    affectedStations: string[] = [],
  ): TrainServiceAlert => ({
    status: "disrupted",
    message: "Train service disrupted",
    affectedLines,
    affectedStations,
    startTime: null,
    endTime: null,
  });

  test("detours around a full-line disruption and reports extra minutes", () => {
    const baseline = planMrtRoute("Woodlands", "Marina Bay");
    expect(baseline?.segments.map((s) => s.line)).toEqual(["Thomson-East Coast Line"]);

    const detoured = planMrtRoute("Woodlands", "Marina Bay", {
      trainAlerts: [alert(["Thomson-East Coast Line"])],
    });
    expect(detoured).not.toBeNull();
    expect(detoured!.detouredForDisruption).toBe(true);
    expect(detoured!.avoidedDisruptedLines).toEqual(["Thomson-East Coast Line"]);
    expect(detoured!.extraMinutesVsNormal).toBeGreaterThan(0);
    expect(detoured!.disruption.lines).toEqual([]);
    expect(detoured!.segments.some((s) => s.line === "Thomson-East Coast Line")).toBe(false);
    expect(detoured!.segments.some((s) => s.line === "North South Line")).toBe(true);
  });

  test("only avoids disrupted stations on a partially affected line", () => {
    const partial = [alert(["East West Line"], ["EW13", "EW14"])];

    // Pasir Ris → Bugis stays east of City Hall (EW13), so EWL remains clear.
    const unaffected = planMrtRoute("Pasir Ris", "Bugis", { trainAlerts: partial });
    expect(unaffected?.segments.map((s) => s.line)).toEqual(["East West Line"]);
    expect(unaffected?.detouredForDisruption).toBe(false);
    expect(unaffected?.disruption.lines).toEqual([]);

    // Bugis → Outram Park normally crosses EW13/EW14, so it detours via DTL/NEL.
    const detoured = planMrtRoute("Bugis", "Outram Park", { trainAlerts: partial });
    expect(detoured?.detouredForDisruption).toBe(true);
    expect(detoured?.disruption.lines).toEqual([]);
    expect(detoured?.segments.some((s) => s.line === "East West Line")).toBe(false);
  });

  test("allows showing the normal disrupted route when avoidDisruptions is false", () => {
    const route = planMrtRoute("Bugis", "Outram Park", {
      avoidDisruptions: false,
      trainAlerts: [alert(["East West Line"], ["EW13", "EW14"])],
    });
    expect(route?.detouredForDisruption).toBe(false);
    expect(route?.disruption.lines).toEqual(["East West Line"]);
    expect(route?.disruption.stations).toEqual(["City Hall", "Raffles Place"]);
    expect(route?.segments[0]?.disrupted).toBe(true);
  });

  test("keeps a station-code disruption on the line the alert names", () => {
    // CC29 (HarbourFront) is shared with the Circle Line Extension, which
    // stays clear when only the Circle Line is disrupted.
    const route = planMrtRoute("HarbourFront", "Keppel", {
      trainAlerts: [alert(["Circle Line"], ["CC29"])],
    });
    expect(route?.segments.map((s) => s.line)).toEqual(["Circle Line Extension"]);
    expect(route?.detouredForDisruption).toBe(false);
    expect(route?.disruption.lines).toEqual([]);
  });

  test("falls back with disruptionUnavoidable when start or end is isolated on a disrupted line", () => {
    const route = planMrtRoute("Pasir Ris", "Bugis", {
      trainAlerts: [alert(["East West Line"])],
    });
    expect(route).not.toBeNull();
    expect(route!.disruptionUnavoidable).toBe(true);
    expect(route!.detouredForDisruption).toBe(false);
    expect(route!.disruption.lines).toContain("East West Line");
    // Fallback minimizes time on the disrupted line by transferring to DTL at Tampines.
    expect(route!.segments.some((s) => s.line === "Downtown Line")).toBe(true);
  });
});

describe("crowd-aware and fewest-transfers routing", () => {
  const buildCrowds = (
    rows: Array<{ line: string; code: string; level: "low" | "moderate" | "high" }>,
  ): TrainCrowds => ({
    updatedAt: "2026-11-23T09:00:00+08:00",
    stations: mergeStationCrowds(rows),
    missingLines: [],
  });

  test("routes around heavily crowded lines in less-crowded mode while keeping truthful travel time", () => {
    const trainCrowds = buildCrowds([
      { line: "Thomson-East Coast Line", code: "TE2", level: "high" },
      { line: "Thomson-East Coast Line", code: "TE9", level: "high" },
      { line: "Thomson-East Coast Line", code: "TE14", level: "high" },
      { line: "Thomson-East Coast Line", code: "TE17", level: "high" },
      { line: "Thomson-East Coast Line", code: "TE20", level: "high" },
      { line: "North South Line", code: "NS9", level: "low" },
      { line: "North South Line", code: "NS16", level: "low" },
      { line: "North South Line", code: "NS22", level: "low" },
      { line: "North South Line", code: "NS27", level: "low" },
    ]);

    const fastest = planMrtRoute("Woodlands", "Marina Bay", {
      mode: "fastest",
      trainCrowds,
    });
    const quieter = planMrtRoute("Woodlands", "Marina Bay", {
      mode: "less-crowded",
      trainCrowds,
    });

    expect(fastest?.segments.map((s) => s.line)).toEqual(["Thomson-East Coast Line"]);
    expect(quieter?.segments.map((s) => s.line)).toEqual(["North South Line"]);
    expect(quieter!.crowd.peak).toBe("low");
    expect(fastest!.crowd.peak).toBe("high");
    expect(isQuieterRoute(quieter, fastest)).toBe(true);
    // Travel time is truthful (not inflated by crowd penalty weights).
    const plainNsl = planMrtRoute("Woodlands", "Marina Bay", {
      trainAlerts: [{ status: "disrupted", message: "", affectedLines: ["Thomson-East Coast Line"], affectedStations: [], startTime: null, endTime: null }],
    });
    expect(quieter!.estimatedMinutes).toBe(plainNsl!.estimatedMinutes);
  });

  test("ranks by transfer count before travel time in fewest-transfers mode", () => {
    // Fastest is NSL → CCL → EWL; NSL → EWL via City Hall is slower but has one transfer.
    const fastest = planMrtRoute("Admiralty", "Bedok", { mode: "fastest" });
    const fewest = planMrtRoute("Admiralty", "Bedok", { mode: "fewest-transfers" });
    expect(fastest!.transfers).toBe(2);
    expect(fewest!.transfers).toBe(1);
    expect(fewest!.segments.map((s) => s.line)).toEqual(["North South Line", "East West Line"]);
  });

  test("prefers direct routes in fewest-transfers mode", () => {
    const fastest = planMrtRoute("Tampines", "Bugis", { mode: "fastest" });
    const direct = planMrtRoute("Tampines", "Bugis", { mode: "fewest-transfers" });
    expect(direct).not.toBeNull();
    expect(direct!.transfers).toBe(0);
    expect(direct!.transfers).toBeLessThanOrEqual(fastest!.transfers);
  });
});
