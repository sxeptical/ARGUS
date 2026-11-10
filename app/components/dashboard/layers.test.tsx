import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LayersSidebar } from "./LayersSidebar";
import { MobileLayersDrawer } from "./MobileLayersDrawer";
import { gymBrandCounts } from "@/lib/gyms";
import { GYMS } from "@/lib/gyms-data";
import { buildLayerGroups } from "@/app/hooks/use-layer-list";
import { FLIGHTS_ENABLED } from "@/lib/features";
import {
  DEFAULT_SENSOR_VISIBILITY,
  LAYERS,
  LAYER_BY_KEY,
  LAYER_GROUPS,
  SensorKey,
  allLayerOptionsOn,
  coerceSensorVisibility,
  toggleLayerOptionSelection,
} from "@/lib/layers";
import { LayerOptionFilter } from "./LayerControls";
import type { SensorRow } from "@/app/hooks/use-dashboard-state";
import type { SensorKey as RegistrySensorKey } from "@/lib/layers";
import type { WeatherData } from "@/types";

// Mirror of use-dashboard-state's registry-driven row construction, with
// deterministic counts so assertions can pin exact markup.
const layerCounts: Record<SensorKey, number> = {
  flights: 7,
  cameras: 11,
  busStops: 23,
  mrt: 9,
  parks: 400,
  incidents: 5,
  carparks: 0,
  evChargers: 0,
  malls: 26,
  hawkers: 114,
  gyms: 381,
  communityClubs: 128,
  pharmacies: 249,
  hotels: 468,
};

const allRows: SensorRow[] = LAYERS.map((layer) => ({
  key: layer.key,
  label: layer.label,
  note: layer.note,
  tone: layer.tone,
  dot: layer.dot,
  value: layerCounts[layer.key],
}));

// use-dashboard-state drops flights from the panel rows when the feed is
// disabled upstream; mirror that here so the render smoke matches reality.
const panelRows = FLIGHTS_ENABLED
  ? allRows
  : allRows.filter((row) => row.key !== "flights");

const weather: WeatherData = {
  temperature: 30,
  humidity: 70,
  psi: 42,
  psiStatus: "Good",
  psiRegions: { north: 40, south: 42, east: 38, west: 41, central: 39 },
  pm25OneHour: 40,
  pm25OneHourBand: "Normal",
  pm25OneHourRegions: { north: 39, south: 40, east: 37, west: 38, central: 36 },
  uv: 6,
  uvStatus: "High",
  fourDay: [],
  forecast: "Partly cloudy",
  lastUpdated: "2026-10-22T00:00:00.000Z",
};

const statsRows = [
  { label: "OSINT Feed", note: "news stream", value: 18, tone: "text-ink" },
];

describe("layer registry", () => {
  test("every layer belongs to a declared group", () => {
    const groupIds = new Set(LAYER_GROUPS.map((group) => group.id));
    for (const layer of LAYERS) {
      expect(groupIds.has(layer.group)).toBe(true);
    }
  });

  test("every group has at least one layer and keys are unique", () => {
    const keys = LAYERS.map((layer) => layer.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const group of LAYER_GROUPS) {
      expect(LAYERS.some((layer) => layer.group === group.id)).toBe(true);
    }
  });

  test("registry, lookup map and defaults cover the same key set", () => {
    expect(LAYER_BY_KEY.size).toBe(LAYERS.length);
    for (const key of Object.keys(DEFAULT_SENSOR_VISIBILITY) as SensorKey[]) {
      expect(LAYER_BY_KEY.has(key)).toBe(true);
    }
  });

  test("legend items only use the two known shapes", () => {
    for (const layer of LAYERS) {
      for (const item of layer.legend ?? []) {
        if (item.kind === "dot") {
          expect(item.tone.length > 0 && item.label.length > 0).toBe(true);
        } else {
          expect(["area", "line", "dashed"]).toContain(item.shape);
        }
      }
    }
  });
});

describe("coerceSensorVisibility", () => {
  test("junk storage falls back to defaults", () => {
    for (const junk of [null, "x", 42, [], true]) {
      expect(coerceSensorVisibility(junk)).toEqual({
        ...DEFAULT_SENSOR_VISIBILITY,
      });
    }
  });

  test("known booleans are kept, missing keys fall back to defaults", () => {
    // Simulates storage written before a layer was added: `parks` is absent
    // and must not surface as `undefined` in toggle state.
    const hydrated = coerceSensorVisibility({ mrt: false, carparks: true });
    expect(hydrated.mrt).toBe(false);
    expect(hydrated.carparks).toBe(true);
    expect(hydrated.parks).toBe(DEFAULT_SENSOR_VISIBILITY.parks);
  });

  test("foreign and non-boolean entries are ignored", () => {
    const hydrated = coerceSensorVisibility({
      mysteryLayer: true,
      malls: "yes" as unknown,
      hawkers: false,
    });
    expect(hydrated.hawkers).toBe(false);
    expect("mysteryLayer" in hydrated).toBe(false);
    expect(hydrated.malls).toBe(DEFAULT_SENSOR_VISIBILITY.malls);
  });
});

describe("buildLayerGroups", () => {
  test("groups and rows follow registry order", () => {
    const groups = buildLayerGroups(allRows, DEFAULT_SENSOR_VISIBILITY, "");
    expect(groups.map((group) => group.id)).toEqual(
      LAYER_GROUPS.map((group) => group.id),
    );
    expect(groups[0].rows.map((row) => row.key)).toEqual([
      "flights",
      "mrt",
      "busStops",
    ]);
    expect(groups[1].rows.map((row) => row.key)).toEqual([
      "cameras",
      "incidents",
      "carparks",
      "evChargers",
    ]);
    expect(groups[2].rows.map((row) => row.key)).toEqual([
      "parks",
      "malls",
      "hawkers",
      "gyms",
      "communityClubs",
      "pharmacies",
      "hotels",
    ]);
  });

  test("counts visible rows per group", () => {
    const groups = buildLayerGroups(allRows, DEFAULT_SENSOR_VISIBILITY, "");
    expect(groups[0].visibleCount).toBe(3); // flights, mrt, busStops default on
    expect(groups[1].visibleCount).toBe(1); // cameras
    expect(groups[2].visibleCount).toBe(0);
  });

  test("filter matches labels, notes and group names", () => {
    const groups = buildLayerGroups(allRows, DEFAULT_SENSOR_VISIBILITY, "mrt");
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((row) => row.key)).toEqual(["mrt"]);

    const byNote = buildLayerGroups(allRows, DEFAULT_SENSOR_VISIBILITY, "free lots");
    expect(byNote).toHaveLength(1);
    expect(byNote[0].rows.map((row) => row.key)).toEqual(["carparks"]);

    // useLayerList lower-cases the query before calling ("PARKS" and
    // "parks" behave identically); buildLayerGroups itself expects
    // already-normalized input. "parks" matches Parks & Trails and is also
    // a substring of the "Carparks" label.
    const normalized = buildLayerGroups(allRows, DEFAULT_SENSOR_VISIBILITY, "parks");
    expect(normalized.map((group) => group.id)).toEqual(["ground", "amenities"]);
    expect(normalized[0].rows.map((row) => row.key)).toEqual(["carparks"]);
    expect(normalized[1].rows.map((row) => row.key)).toEqual(["parks"]);
  });

  test("a matching group label shows the whole group", () => {
    const groups = buildLayerGroups(
      allRows,
      DEFAULT_SENSOR_VISIBILITY,
      "roads & parking",
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((row) => row.key)).toEqual([
      "cameras",
      "incidents",
      "carparks",
      "evChargers",
    ]);
  });

  test("a filter with no matches yields no groups", () => {
    expect(buildLayerGroups(allRows, DEFAULT_SENSOR_VISIBILITY, "submarine")).toEqual([]);
  });

  test("feature-gated rows never regroup into other sections", () => {
    // flights dropped upstream must not leak into any group's toggle counts.
    const groups = buildLayerGroups(panelRows, DEFAULT_SENSOR_VISIBILITY, "");
    expect(groups.flatMap((group) => group.rows.map((row) => row.key))).not.toContain("flights");
  });
});

// renderToStaticMarkup emits HTML-escaped text ("&" as "&amp;").
const htmlEscape = (text: string) => text.replace(/&/g, "&amp;");

describe("layer surfaces render", () => {
  test("sidebar renders grouped, collapsible sections with the filter box", () => {
    const markup = renderToStaticMarkup(
      <LayersSidebar
        flights={[]}
        selectedFlight={null}
        sensorRows={panelRows}
        sensorStatsRows={statsRows}
        sensorVisibility={DEFAULT_SENSOR_VISIBILITY}
        setSelectedFlight={() => {}}
        setSensorVisibility={() => {}}
        gymBrands={{}}
        gymBrandCounts={gymBrandCounts(GYMS)}
        onGymBrandsChange={() => {}}
        visibleSensorCount={4}
        weather={weather}
        weatherHistory={[]}
      />,
    );
    for (const group of LAYER_GROUPS) {
      expect(markup).toContain(htmlEscape(group.label));
    }
    expect(markup).toContain("Filter layers");
    expect(markup).toContain("Hawker Centres");
    expect(markup).toContain("OSINT Feed");
    if (!FLIGHTS_ENABLED) {
      expect(markup).not.toContain("Air Activity");
    }
  });

  test("mobile drawer renders the same groups and per-row dots", () => {
    const markup = renderToStaticMarkup(
      <MobileLayersDrawer
        sensorRows={panelRows}
        sensorVisibility={DEFAULT_SENSOR_VISIBILITY}
        setSensorVisibility={() => {}}
        gymBrands={{}}
        gymBrandCounts={gymBrandCounts(GYMS)}
        onGymBrandsChange={() => {}}
        visibleSensorCount={4}
      />,
    );
    for (const group of LAYER_GROUPS) {
      expect(markup).toContain(htmlEscape(group.label));
    }
    expect(markup).toContain("MRT &amp; LRT");
    expect(markup).toContain("4/13 visible");
  });
});

// Keep the re-exported alias honest: both names must stay the same type.
const _typeAliasCheck: RegistrySensorKey extends SensorKey ? true : false = true;
void _typeAliasCheck;

describe("toggleLayerOptionSelection", () => {
  const all = ["a", "b", "c"];
  const allOn = allLayerOptionsOn(all);

  test("first tap when all on solos the option", () => {
    expect(toggleLayerOptionSelection(allOn, "b", all)).toEqual({ a: false, b: true, c: false });
  });

  test("later taps toggle options normally", () => {
    const solo = toggleLayerOptionSelection(allOn, "b", all);
    expect(toggleLayerOptionSelection(solo, "c", all)).toEqual({ a: false, b: true, c: true });
    expect(toggleLayerOptionSelection(solo, "b", all)).toEqual(allOn);
  });

  test("deselecting the last on-option reverts to all", () => {
    expect(toggleLayerOptionSelection({ a: false, b: true, c: false }, "b", all)).toEqual(allOn);
  });

  test("absent keys read as on", () => {
    expect(toggleLayerOptionSelection({}, "b", all)).toEqual({ a: false, b: true, c: false });
  });
});

const subFilterOptions = [
  { value: "ActiveSG", label: "ActiveSG", count: 31 },
  { value: "Anytime Fitness", label: "Anytime Fitness", count: 130 },
  { value: "F45 Training", label: "F45 Training", count: 16 },
  { value: "Snap Fitness", label: "Snap Fitness", count: 14 },
  { value: "CrossFit", label: "CrossFit", count: 13 },
  { value: "Independent", label: "Independent", count: 137 },
  { value: "Fitness First", label: "Fitness First", count: 8 },
];

describe("LayerOptionFilter", () => {
  const render = (selected: Record<string, boolean>) =>
    renderToStaticMarkup(
      <LayerOptionFilter
        summaryLabel="Brands"
        options={subFilterOptions}
        selected={selected}
        onChange={() => {}}
        accentClass="bg-signal-gym"
      />,
    );

  test("collapses to a summary line by default", () => {
    expect(render({})).toContain("Brands");
    expect(render({})).toContain("All");
    expect(render({})).not.toContain("+1 more");
    expect(render({})).toContain('aria-expanded="false"');
    expect(render({ "Anytime Fitness": true, ActiveSG: true, "F45 Training": false, "Snap Fitness": false, CrossFit: false, Independent: false, "Fitness First": false })).toContain("ActiveSG, Anytime Fitness");
    expect(render({ "Anytime Fitness": true, ActiveSG: false, "F45 Training": true, "Snap Fitness": true, CrossFit: false, Independent: false, "Fitness First": false })).toContain("3 selected");
  });
});
