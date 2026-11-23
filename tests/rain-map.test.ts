import { describe, expect, test } from "bun:test";
import { FALLBACK_FORECAST_AREAS } from "@/lib/data/forecast-areas";
import {
  FORECAST_AREA_GEOMETRY_BY_NAME,
  FORECAST_AREAS_GEOJSON,
} from "@/lib/data/forecast-areas-geometry";
import {
  buildRainMapData,
  filterAreaNamesByGeoFilter,
  geoFilterToMinimapEllipse,
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
  projectToMinimap,
} from "@/lib/rain-map";
import type { RainOutlook, WeatherAlerts } from "@/types";

describe("forecast areas geometry bundle", () => {
  test("provides a valid Polygon or MultiPolygon for all 47 NEA forecast areas", () => {
    expect(FORECAST_AREAS_GEOJSON.features).toHaveLength(
      FALLBACK_FORECAST_AREAS.length,
    );
    for (const area of FALLBACK_FORECAST_AREAS) {
      const geometry = FORECAST_AREA_GEOMETRY_BY_NAME.get(area.name.toLowerCase());
      expect(geometry).toBeDefined();
      expect(geometry!.coordinates.length).toBeGreaterThan(0);
    }
  });
});

describe("projectToMinimap", () => {
  test("projects Singapore forecast area coordinates inside the SVG viewBox", () => {
    const west = projectToMinimap(1.294947, 103.635); // Tuas
    const east = projectToMinimap(1.403, 104.053); // Pulau Tekong
    expect(west.x).toBeGreaterThanOrEqual(0);
    expect(east.x).toBeLessThanOrEqual(MINIMAP_WIDTH);
    expect(west.x).toBeLessThan(east.x);
    expect(east.y).toBeLessThan(west.y);
    expect(east.y).toBeGreaterThanOrEqual(0);
    expect(west.y).toBeLessThanOrEqual(MINIMAP_HEIGHT);
  });
});

describe("buildRainMapData", () => {
  const storms: WeatherAlerts = {
    rain: {
      observedAt: "2026-11-23T07:00:00Z",
      stationCount: 60,
      rainingStations: 5,
      maxMm: 8.2,
      peakMm: 8.2,
      rainingAreas: ["Changi", "Bedok"],
      heavyAreas: ["Changi"],
    },
    lightning: {
      strikes: 6,
      groundStrikes: 2,
      areas: ["Changi", "Tuas"],
      lastStrikeAt: "2026-11-23T06:58:00Z",
    },
  };

  const outlook: RainOutlook = {
    nextTwoHours: {
      validFrom: "2026-11-23T07:00:00Z",
      validTo: "2026-11-23T09:00:00Z",
      areaCount: 47,
      rain: [
        { place: "Woodlands", forecast: "Thundery Showers" },
        { place: "Clementi", forecast: "Light Showers" },
      ],
    },
    periods: [],
  };

  test("combines live rain, heavy rain, and lightning severities with SVG patch paths", () => {
    const { dots, active } = buildRainMapData("now", storms, outlook);
    expect(dots).toHaveLength(47);
    expect(dots.every((dot) => dot.svgPath.startsWith("M"))).toBe(true);
    expect(active.map((a) => [a.name, a.tone, a.label])).toEqual([
      ["Changi", "danger", "Lightning · Heavy rain"],
      ["Tuas", "danger", "Lightning"],
      ["Bedok", "info", "Raining"],
    ]);
    // Active severe patches sort last so they paint above dry patches in SVG.
    expect(dots.at(-1)?.active?.tone).toBe("danger");
  });

  test("maps 2-hour forecast areas with warning tone for thundery showers", () => {
    const { active } = buildRainMapData("2h", storms, outlook);
    expect(active.map((a) => [a.name, a.tone, a.label, a.lightning])).toEqual([
      ["Woodlands", "warning", "Thundery Showers", true],
      ["Clementi", "info", "Light Showers", false],
    ]);
  });

  test("scopes active areas and names to the active radius filter", () => {
    const changiFilter = { center: [103.987, 1.357] as const, radiusM: 2_000 };
    const { dots, active, inRadiusCount } = buildRainMapData(
      "now",
      storms,
      outlook,
      changiFilter,
    );

    expect(inRadiusCount).toBeGreaterThanOrEqual(1);
    expect(inRadiusCount).toBeLessThan(47);
    expect(active.map((a) => a.name)).toEqual(["Changi"]);
    expect(dots.find((d) => d.name === "Changi")?.inRadius).toBe(true);
    expect(dots.find((d) => d.name === "Tuas")?.inRadius).toBe(false);
    expect(dots.find((d) => d.name === "Tuas")?.active).toBeNull();

    expect(filterAreaNamesByGeoFilter(["Changi", "Tuas"], changiFilter)).toEqual([
      "Changi",
    ]);

    const ellipse = geoFilterToMinimapEllipse(changiFilter);
    expect(ellipse.cx).toBeGreaterThan(0);
    expect(ellipse.cx).toBeLessThan(MINIMAP_WIDTH);
    expect(ellipse.cy).toBeGreaterThan(0);
    expect(ellipse.cy).toBeLessThan(MINIMAP_HEIGHT);
    expect(ellipse.rx).toBeGreaterThan(0);
    expect(ellipse.ry).toBeGreaterThan(0);
  });
});
