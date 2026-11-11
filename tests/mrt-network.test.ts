import { describe, expect, test } from "bun:test";
import {
  LRT_LINE_STATIONS,
  MRT_DISPLAY_LINE_STATIONS,
  MRT_OPERATIONAL_LINE_STATIONS,
} from "@/lib/mrt-network";
import { isRouteableMrtStation } from "@/lib/mrt-routing";
import mrtLinesData from "@/public/mrt-lines.json";
import type { MRTGeoJson } from "@/types";

describe("mrt-network single source of truth", () => {
  test("operational lines are a subset of display lines with same references", () => {
    for (const [line, stations] of Object.entries(
      MRT_OPERATIONAL_LINE_STATIONS,
    )) {
      expect(MRT_DISPLAY_LINE_STATIONS[line]).toBe(stations);
    }
  });

  test("future extensions are display-only and not routeable", () => {
    expect(MRT_DISPLAY_LINE_STATIONS["Thomson-East Coast Line Extension"]).toEqual(
      ["Bayshore", "Bedok South", "Sungei Bedok"],
    );
    expect(isRouteableMrtStation("Bedok South")).toBe(false);
    expect(isRouteableMrtStation("Sungei Bedok")).toBe(false);
    // Bayshore itself is operational (TEL terminus)
    expect(isRouteableMrtStation("Bayshore")).toBe(true);

    expect(MRT_DISPLAY_LINE_STATIONS["Downtown Line Extension"]).toEqual(
      ["Expo", "Xilin", "Sungei Bedok"],
    );
    expect(isRouteableMrtStation("Xilin")).toBe(false);
    // Expo itself is operational (DTL terminus)
    expect(isRouteableMrtStation("Expo")).toBe(true);
  });

  test("extended lines match LTA's station totals (CNA, 4 Nov 2026)", () => {
    const stationCount = (...lines: string[]) =>
      new Set(lines.flatMap((line) => MRT_DISPLAY_LINE_STATIONS[line])).size;
    expect(stationCount("Thomson-East Coast Line", "Thomson-East Coast Line Extension")).toBe(29);
    expect(stationCount("Downtown Line", "Downtown Line Extension")).toBe(37);
  });

  test("every line has one geometry vertex per station", () => {
    for (const { properties, geometry } of (mrtLinesData as MRTGeoJson).features) {
      expect([properties.name, geometry.coordinates.length]).toEqual([
        properties.name,
        MRT_DISPLAY_LINE_STATIONS[properties.name].length,
      ]);
    }
  });

  test("the new eastern lines join their parent lines and each other", () => {
    const coordinates = (line: string) =>
      (mrtLinesData as MRTGeoJson).features.find((feature) => feature.properties.name === line)?.geometry
        .coordinates ?? [];
    expect(coordinates("Downtown Line Extension")[0]).toEqual(coordinates("Downtown Line").at(-1)!);
    expect(coordinates("Thomson-East Coast Line Extension")[0]).toEqual(coordinates("Thomson-East Coast Line").at(-1)!);
    expect(coordinates("Downtown Line Extension").at(-1)!).toEqual(coordinates("Thomson-East Coast Line Extension").at(-1)!);
  });

  test("LRT lines are routeable and loops close on their MRT interchange", () => {
    for (const [line, stations] of Object.entries(LRT_LINE_STATIONS)) {
      expect(MRT_OPERATIONAL_LINE_STATIONS[line]).toBe(stations);
      for (const station of stations) expect(isRouteableMrtStation(station)).toBe(true);
    }
    for (const line of ["Sengkang LRT East Loop", "Sengkang LRT West Loop", "Punggol LRT East Loop", "Punggol LRT West Loop"]) {
      const stations = LRT_LINE_STATIONS[line];
      expect(stations[0]).toBe(stations[stations.length - 1]);
    }
    // Bukit Panjang LRT: branch out from Choa Chu Kang, loop from Bukit Panjang.
    expect(LRT_LINE_STATIONS["Bukit Panjang LRT"][0]).toBe("Choa Chu Kang");
    expect(LRT_LINE_STATIONS["Bukit Panjang LRT"].filter((s) => s === "Bukit Panjang")).toHaveLength(2);
  });
});
