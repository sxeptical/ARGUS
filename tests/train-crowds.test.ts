import { describe, expect, test } from "bun:test";
import { MRT_OPERATIONAL_LINE_STATIONS } from "@/lib/mrt-network";
import {
  busiestOnLine,
  crowdOnLine,
  mergeStationCrowds,
  parseCrowdLevel,
  stationNameForCode,
} from "@/lib/train-crowds";

describe("stationNameForCode", () => {
  test("resolves numbered, LRT and town-centre codes", () => {
    expect(stationNameForCode("EW13")).toBe("City Hall");
    expect(stationNameForCode("ns1")).toBe("Jurong East");
    expect(stationNameForCode("CG0")).toBe("Tanah Merah");
    expect(stationNameForCode("TE22")).toBe("Gardens by the Bay");
    expect(stationNameForCode("BP13")).toBe("Senja");
    expect(stationNameForCode("STC")).toBe("Sengkang");
    expect(stationNameForCode("PW7")).toBe("Soo Teck");
  });

  test("returns null for unopened or unknown codes", () => {
    expect(stationNameForCode("NS6")).toBeNull();
    expect(stationNameForCode("CC18")).toBeNull();
    expect(stationNameForCode("JS1")).toBeNull();
    expect(stationNameForCode("nonsense")).toBeNull();
  });

  test("every mapped name is a station the map draws", () => {
    const known = new Set(Object.values(MRT_OPERATIONAL_LINE_STATIONS).flat());
    const prefixes = ["NS", "EW", "CG", "NE", "CC", "CE", "DT", "TE", "BP", "SE", "SW", "PE", "PW"];
    const names = prefixes.flatMap((prefix) =>
      Array.from({ length: 40 }, (_, n) => stationNameForCode(`${prefix}${n}`)).filter(
        (name): name is string => name !== null,
      ),
    );
    expect(names.filter((name) => !known.has(name))).toEqual([]);
  });
});

describe("parseCrowdLevel", () => {
  test("maps LTA's single-letter levels and drops NA", () => {
    expect(parseCrowdLevel("l")).toBe("low");
    expect(parseCrowdLevel("M")).toBe("moderate");
    expect(parseCrowdLevel("h")).toBe("high");
    expect(parseCrowdLevel("NA")).toBeNull();
    expect(parseCrowdLevel(null)).toBeNull();
  });
});

describe("mergeStationCrowds", () => {
  test("merges interchange codes, keeps the busiest level, sorts busiest first", () => {
    const merged = mergeStationCrowds([
      { line: "East West Line", code: "EW13", level: "low" },
      { line: "North South Line", code: "NS25", level: "high" },
      { line: "Circle Line", code: "CC2", level: "moderate" },
      { line: "East West Line", code: "EW12", level: "low" },
    ]);
    expect(merged.map((crowd) => [crowd.station, crowd.level])).toEqual([
      ["City Hall", "high"],
      ["Bras Basah", "moderate"],
      ["Bugis", "low"],
    ]);
    expect(merged[0].lines.map((line) => line.code)).toEqual(["EW13", "NS25"]);
  });

  test("keeps unknown codes under their code and drops repeated codes", () => {
    const merged = mergeStationCrowds([
      { line: "Sengkang LRT", code: "STC", level: "low" },
      { line: "Sengkang LRT", code: "STC", level: "high" },
      { line: "Jurong Region Line", code: "JS9", level: "low" },
    ]);
    expect(merged.find((crowd) => crowd.station === "Sengkang")?.lines).toHaveLength(1);
    expect(merged.some((crowd) => crowd.station === "JS9")).toBe(true);
  });
});

describe("crowdOnLine and busiestOnLine", () => {
  const crowds = new Map(
    mergeStationCrowds([
      { line: "North South Line", code: "NS25", level: "high" },
      { line: "East West Line", code: "EW13", level: "low" },
      { line: "East West Line", code: "EW12", level: "moderate" },
      { line: "Sengkang LRT", code: "SE1", level: "moderate" },
    ]).map((crowd) => [crowd.station, crowd]),
  );

  test("reads the platform for the ridden line, falling back to the station", () => {
    expect(crowdOnLine(crowds.get("City Hall"), "East West Line")).toBe("low");
    expect(crowdOnLine(crowds.get("City Hall"), "North South Line")).toBe("high");
    expect(crowdOnLine(crowds.get("Compassvale"), "Sengkang LRT East Loop")).toBe("moderate");
    expect(crowdOnLine(crowds.get("City Hall"), "Circle Line")).toBe("high");
    expect(crowdOnLine(undefined, "East West Line")).toBeNull();
  });

  test("finds the busiest stop on the line", () => {
    expect(busiestOnLine(["City Hall", "Bugis", "Lavender"], "East West Line", crowds)).toEqual({
      station: "Bugis",
      level: "moderate",
    });
    expect(busiestOnLine(["Lavender"], "East West Line", crowds)).toBeNull();
  });
});
