import { describe, expect, test } from "bun:test";
import {
  MRT_DISPLAY_LINE_COUNT,
  MRT_DISPLAY_LINE_STATIONS,
  MRT_OPERATIONAL_LINE_COUNT,
  MRT_OPERATIONAL_LINE_STATIONS,
} from "./mrt-network";
import { isRouteableMrtStation } from "./mrt-routing";

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
  });

  test("line counts are derived, not hardcoded", () => {
    expect(MRT_OPERATIONAL_LINE_COUNT).toBe(
      Object.keys(MRT_OPERATIONAL_LINE_STATIONS).length,
    );
    expect(MRT_DISPLAY_LINE_COUNT).toBe(
      Object.keys(MRT_DISPLAY_LINE_STATIONS).length,
    );
    expect(MRT_DISPLAY_LINE_COUNT).toBeGreaterThan(
      MRT_OPERATIONAL_LINE_COUNT,
    );
  });
});
