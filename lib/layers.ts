/**
 * Layer registry: the single source of truth for every toggleable map layer.
 *
 * Layers used to be defined piecewise in five places (the SensorKey union,
 * the default visibility state, the sidebar rows, the mobile drawer dots and
 * the map legend), so adding one meant editing all of them and they could
 * drift. Everything the UI needs to know about a layer now lives here; the
 * sidebar, the mobile drawer and the map legend all derive from this
 * registry, so the layer list can grow without the UI growing with it.
 *
 * To add a layer:
 * 1. Add its key to SensorKey, an entry to LAYERS (in display order within
 *    its group) and a default in DEFAULT_SENSOR_VISIBILITY.
 * 2. Give it a count in use-dashboard-state's layerCounts (the Record is
 *    exhaustive, so TypeScript flags a missing entry).
 * 3. Draw it in Map.tsx and gate its map layers on the visibility flag.
 */

export type SensorKey =
  | "flights"
  | "cameras"
  | "busStops"
  | "mrt"
  | "parks"
  | "incidents"
  | "carparks"
  | "evChargers"
  | "malls"
  | "hawkers"
  | "gyms"
  | "communityClubs"
  | "pharmacies"
  | "hotels"
  | "heritage"
  | "healthcare"
  | "libraries"
  | "supermarkets"
  | "schools";

/**
 * Layer groups, in display order. Groups are what keep the panel readable as
 * layers accumulate: the list grows by collapsible sections, not by rows.
 */
export const LAYER_GROUPS = [
  { id: "transport", label: "Transport" },
  { id: "ground", label: "Roads & Parking" },
  { id: "amenities", label: "Amenities" },
] as const;

export type LayerGroupId = (typeof LAYER_GROUPS)[number]["id"];

/** One legend key; maps 1:1 onto LegendDot / LegendSwatch in IntelPanel. */
export type LayerLegendItem =
  | { readonly kind: "dot"; readonly tone: string; readonly label: string }
  | {
      readonly kind: "swatch";
      readonly shape: "area" | "line" | "dashed";
      readonly tone: string;
      readonly label: string;
    };

export type LayerDefinition = {
  readonly key: SensorKey;
  readonly group: LayerGroupId;
  readonly label: string;
  readonly note: string;
  /** Text tone class for the layer count value (e.g. "text-signal-bus"). */
  readonly tone: string;
  /** Background tone class for the layer dot (e.g. "bg-signal-bus"). */
  readonly dot: string;
  /** Legend entries shown on the map while the layer is visible. */
  readonly legend?: readonly LayerLegendItem[];
};

export const LAYERS: readonly LayerDefinition[] = [
  {
    key: "flights",
    group: "transport",
    label: "Air Activity",
    note: "live tracks",
    tone: "text-signal-inbound",
    dot: "bg-signal-inbound",
    legend: [
      { kind: "dot", tone: "bg-signal-inbound", label: "Inbound" },
      { kind: "dot", tone: "bg-signal-outbound", label: "Outbound" },
      { kind: "dot", tone: "bg-signal-transit", label: "Transit" },
    ],
  },
  {
    key: "mrt",
    group: "transport",
    label: "MRT & LRT",
    note: "lines + stations",
    tone: "text-signal-mrt",
    dot: "bg-signal-mrt",
    legend: [{ kind: "dot", tone: "bg-signal-mrt", label: "MRT" }],
  },
  {
    key: "busStops",
    group: "transport",
    label: "Bus Stops",
    note: "monitor points",
    tone: "text-signal-bus",
    dot: "bg-signal-bus",
    legend: [{ kind: "dot", tone: "bg-signal-bus", label: "Bus" }],
  },
  {
    key: "cameras",
    group: "ground",
    label: "Road Cameras",
    note: "stream nodes",
    tone: "text-signal-camera",
    dot: "bg-signal-camera",
    legend: [{ kind: "dot", tone: "bg-signal-camera", label: "Cameras" }],
  },
  {
    key: "incidents",
    group: "ground",
    label: "Road Incidents",
    note: "live events",
    tone: "text-signal-incident",
    dot: "bg-signal-incident",
    legend: [{ kind: "dot", tone: "bg-signal-incident", label: "Incidents" }],
  },
  {
    key: "carparks",
    group: "ground",
    label: "Carparks",
    note: "live free lots",
    tone: "text-signal-carpark",
    dot: "bg-signal-carpark",
    legend: [{ kind: "dot", tone: "bg-signal-carpark", label: "Carparks" }],
  },
  {
    key: "evChargers",
    group: "ground",
    label: "EV Charging",
    note: "live chargers",
    tone: "text-signal-ev",
    dot: "bg-signal-ev",
    legend: [{ kind: "dot", tone: "bg-signal-ev", label: "EV" }],
  },
  {
    key: "parks",
    group: "amenities",
    label: "Parks & Trails",
    note: "parks · connectors · trails",
    tone: "text-signal-park",
    dot: "bg-signal-park",
    legend: [
      {
        kind: "swatch",
        shape: "area",
        tone: "border-signal-park bg-signal-park/30",
        label: "Parks",
      },
      {
        kind: "swatch",
        shape: "line",
        tone: "bg-signal-park",
        label: "Park connectors",
      },
      {
        kind: "swatch",
        shape: "dashed",
        tone: "border-signal-park",
        label: "Trails",
      },
    ],
  },
  {
    key: "malls",
    group: "amenities",
    label: "Malls",
    note: "shopping centres",
    tone: "text-signal-mall",
    dot: "bg-signal-mall",
    legend: [{ kind: "dot", tone: "bg-signal-mall", label: "Malls" }],
  },
  {
    key: "hawkers",
    group: "amenities",
    label: "Hawker Centres",
    note: "food centres",
    tone: "text-signal-hawker",
    dot: "bg-signal-hawker",
    legend: [{ kind: "dot", tone: "bg-signal-hawker", label: "Hawkers" }],
  },
  {
    key: "gyms",
    group: "amenities",
    label: "Gyms",
    note: "fitness centres",
    tone: "text-signal-gym",
    dot: "bg-signal-gym",
    legend: [{ kind: "dot", tone: "bg-signal-gym", label: "Gyms" }],
  },
  {
    key: "communityClubs",
    group: "amenities",
    label: "Community Clubs",
    note: "PA outlets",
    tone: "text-signal-community-club",
    dot: "bg-signal-community-club",
    legend: [{ kind: "dot", tone: "bg-signal-community-club", label: "Community Clubs" }],
  },
  {
    key: "pharmacies",
    group: "amenities",
    label: "Pharmacies",
    note: "retail pharmacies",
    tone: "text-signal-pharmacy",
    dot: "bg-signal-pharmacy",
    legend: [{ kind: "dot", tone: "bg-signal-pharmacy", label: "Pharmacies" }],
  },
  {
    key: "hotels",
    group: "amenities",
    label: "Hotels",
    note: "licensed hotels",
    tone: "text-signal-hotel",
    dot: "bg-signal-hotel",
    legend: [{ kind: "dot", tone: "bg-signal-hotel", label: "Hotels" }],
  },
  {
    key: "heritage",
    group: "amenities",
    label: "Heritage",
    note: "historic sites · monuments · museums",
    tone: "text-signal-heritage",
    dot: "bg-signal-heritage",
    legend: [{ kind: "dot", tone: "bg-signal-heritage", label: "Heritage" }],
  },
  {
    key: "healthcare",
    group: "amenities",
    label: "Healthcare",
    note: "GP · hospitals · dental",
    tone: "text-signal-healthcare",
    dot: "bg-signal-healthcare",
    legend: [{ kind: "dot", tone: "bg-signal-healthcare", label: "Healthcare" }],
  },
  {
    key: "libraries",
    group: "amenities",
    label: "Libraries",
    note: "public libraries",
    tone: "text-signal-library",
    dot: "bg-signal-library",
    legend: [{ kind: "dot", tone: "bg-signal-library", label: "Libraries" }],
  },
  {
    key: "supermarkets",
    group: "amenities",
    label: "Supermarkets",
    note: "grocery supermarkets",
    tone: "text-signal-supermarket",
    dot: "bg-signal-supermarket",
    legend: [{ kind: "dot", tone: "bg-signal-supermarket", label: "Supermarkets" }],
  },
  {
    key: "schools",
    group: "amenities",
    label: "Schools",
    note: "MOE schools",
    tone: "text-signal-school",
    dot: "bg-signal-school",
    legend: [{ kind: "dot", tone: "bg-signal-school", label: "Schools" }],
  },
];

export const LAYER_BY_KEY: ReadonlyMap<SensorKey, LayerDefinition> = new Map(
  LAYERS.map((layer) => [layer.key, layer]),
);

/** Visibility on first load, and the fallback for unknown persisted keys. */
export const DEFAULT_SENSOR_VISIBILITY: Record<SensorKey, boolean> = {
  flights: true,
  cameras: true,
  busStops: true,
  mrt: true,
  parks: false,
  incidents: false,
  carparks: false,
  evChargers: false,
  malls: false,
  hawkers: false,
  gyms: false,
  communityClubs: false,
  pharmacies: false,
  hotels: false,
  heritage: false,
  healthcare: false,
  libraries: false,
  supermarkets: false,
  schools: false,
};

/**
 * Hydrate persisted visibility of unknown shape: keep known boolean entries,
 * fall back to defaults for everything else (layers added after the value
 * was written, corrupted storage, foreign data). The layer set evolves, so
 * an old localStorage entry must never break hydration.
 */
export function coerceSensorVisibility(
  value: unknown,
): Record<SensorKey, boolean> {
  const next: Record<SensorKey, boolean> = { ...DEFAULT_SENSOR_VISIBILITY };
  if (!value || typeof value !== "object") return next;
  const stored = value as Record<string, unknown>;
  for (const layer of LAYERS) {
    const entry = stored[layer.key];
    if (typeof entry === "boolean") next[layer.key] = entry;
  }
  return next;
}

/**
 * Totally-on record for a sub-filter's options. A sub-filter tracks
 * `Record<option, boolean>` like layer visibility does; an option absent
 * from the record reads as on.
 */
export function allLayerOptionsOn(
  allValues: ReadonlyArray<string>,
): Record<string, boolean> {
  return Object.fromEntries(allValues.map((value) => [value, true]));
}

/**
 * Toggle one sub-filter option (e.g. a gym brand). When everything is on,
 * tapping an option solos it; later taps toggle options normally, and
 * deselecting the last on-option reverts to all-on rather than stranding
 * an empty layer.
 */
export function toggleLayerOptionSelection(
  selected: Readonly<Record<string, boolean>>,
  value: string,
  allValues: ReadonlyArray<string>,
): Record<string, boolean> {
  const onCount = allValues.filter((option) => selected[option] !== false).length;
  if (onCount === allValues.length) {
    return Object.fromEntries(allValues.map((option) => [option, option === value]));
  }
  const next = { ...selected, [value]: selected[value] === false };
  if (allValues.every((option) => next[option] === false)) return allLayerOptionsOn(allValues);
  return next;
}
