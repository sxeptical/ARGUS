/**
 * Amenity registry: everything the dashboard needs to know about each static
 * point amenity (malls, gyms, schools, ...) in one place. The map, the layer
 * counts, map search, the sub-filter chips and the focus dialog all loop over
 * this list, so none of them names an individual amenity.
 *
 * To add an amenity:
 * 1. Add its record type to AmenityPlaces in types/index.ts and its layer to
 *    LAYERS in lib/layers.ts.
 * 2. Add its entry below (TypeScript flags a missing one).
 * 3. Give it a body in FocusDialog's AmenityFocus.
 */
import { describeHawkerCentre, describeMall } from "@/lib/amenities";
import { HAWKER_CENTRES, MALLS } from "@/lib/data/amenities";
import { COMMUNITY_CLUB_KIND_LABEL, describeCommunityClub } from "@/lib/community-clubs";
import { COMMUNITY_CLUBS } from "@/lib/data/community-clubs";
import { describeGym, GYM_CATEGORY_LABEL } from "@/lib/gyms";
import { GYMS } from "@/lib/data/gyms";
import { describeHealthcare, HEALTHCARE_KIND_LABEL } from "@/lib/healthcare";
import { HEALTHCARE_SITES } from "@/lib/data/healthcare";
import { describeHeritage, HERITAGE_KIND_LABEL } from "@/lib/heritage";
import { HERITAGE_SITES } from "@/lib/data/heritage";
import { describeHotel } from "@/lib/hotels";
import { HOTELS } from "@/lib/data/hotels";
import type { SensorKey } from "@/lib/layers";
import { describeLibrary } from "@/lib/libraries";
import { LIBRARIES } from "@/lib/data/libraries";
import type { PopupLine } from "@/lib/mobility";
import { describePharmacy } from "@/lib/pharmacies";
import { PHARMACIES } from "@/lib/data/pharmacies";
import { describeSchool, SCHOOL_LEVEL_LABEL } from "@/lib/schools";
import { SCHOOLS } from "@/lib/data/schools";
import { describeSupermarket } from "@/lib/supermarkets";
import { SUPERMARKETS } from "@/lib/data/supermarkets";
import { parseLayerOptionSelection } from "@/lib/ui-preferences";
import {
  GYM_BRANDS,
  HEALTHCARE_KINDS,
  HERITAGE_KINDS,
  SCHOOL_LEVELS,
  SUPERMARKET_BRANDS,
  type AmenityPlaces,
  type AmenityType,
  type MapSearchResult,
  type PlacePhoto,
} from "@/types";

/** The fields every amenity record shares. */
export type AmenityPlace = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  photos?: PlacePhoto[];
};

/** A sub-filter under a layer row, e.g. gym operator brands. */
type SubFilterDefinition<T> = {
  /** Short plural name shown before the summary: "Brands", "Types", "Levels". */
  readonly label: string;
  /** The option a place belongs to. */
  readonly of: (place: T) => string;
  /** Every option the bundle can carry, in display order. */
  readonly options: ReadonlyArray<string>;
  readonly optionLabel?: Readonly<Record<string, string>>;
  /** Show the options with the most places first instead of in `options` order. */
  readonly byCount?: boolean;
  /** Options held at the start / end regardless of count. */
  readonly first?: string;
  readonly last?: string;
};

type AmenityDefinition<T> = {
  /** The layer registry key that toggles it. */
  readonly layer: SensorKey;
  readonly places: ReadonlyArray<T>;
  /** Marker colour on the map; mirrors the layer's `--signal-*` CSS token. */
  readonly color: string;
  /** Upper-case title of the hover popup. */
  readonly popupTitle: (place: T) => string;
  readonly describe: (place: T) => PopupLine[];
  /** Extra search terms; the address is always searchable. */
  readonly keywords: (place: T) => string[];
  /** Places drawn in the muted colour (hawker centres under construction). */
  readonly muted?: (place: T) => boolean;
  /** Dense layers only appear from `points` zoom and label from `labels`. */
  readonly minZoom?: { readonly points: number; readonly labels: number };
  readonly filter?: SubFilterDefinition<T>;
};

/**
 * In map draw order (later entries are drawn on top), which is why
 * healthcare, the densest layer, comes last.
 */
const DEFINITIONS = {
  mall: {
    layer: "malls",
    places: MALLS,
    color: "#e879c6",
    popupTitle: () => "MALL",
    describe: describeMall,
    keywords: () => ["mall", "shopping"],
  },
  hawker: {
    layer: "hawkers",
    places: HAWKER_CENTRES,
    color: "#f0b060",
    popupTitle: () => "HAWKER CENTRE",
    describe: (hawker) => describeHawkerCentre(hawker),
    keywords: () => ["hawker", "food centre"],
    muted: (hawker) => hawker.status === "planned",
  },
  gym: {
    layer: "gyms",
    places: GYMS,
    color: "#c084fc",
    popupTitle: () => "GYM",
    describe: describeGym,
    keywords: (gym) => ["gym", "fitness", GYM_CATEGORY_LABEL[gym.category], gym.brand, ...(gym.aliases ?? [])],
    // ActiveSG (the public option) is pinned first, then the biggest chains.
    filter: { label: "Brands", of: (gym) => gym.brand, options: GYM_BRANDS, byCount: true, first: "ActiveSG" },
  },
  "community-club": {
    layer: "communityClubs",
    places: COMMUNITY_CLUBS,
    color: "#4fc3e5",
    popupTitle: (club) => (club.kind === "passionwave" ? "PASSIONWAVE" : "COMMUNITY CLUB"),
    describe: describeCommunityClub,
    keywords: (club) => ["community club", "PA", COMMUNITY_CLUB_KIND_LABEL[club.kind]],
  },
  pharmacy: {
    layer: "pharmacies",
    places: PHARMACIES,
    color: "#f0715f",
    popupTitle: () => "PHARMACY",
    describe: describePharmacy,
    keywords: () => ["pharmacy", "chemist"],
  },
  hotel: {
    layer: "hotels",
    places: HOTELS,
    color: "#5f9fe8",
    popupTitle: () => "HOTEL",
    describe: describeHotel,
    keywords: (hotel) => ["hotel", "stay", ...(hotel.rooms !== null ? [String(hotel.rooms)] : [])],
  },
  heritage: {
    layer: "heritage",
    places: HERITAGE_SITES,
    color: "#d9c84f",
    popupTitle: () => "HERITAGE",
    describe: describeHeritage,
    keywords: (site) => ["heritage", HERITAGE_KIND_LABEL[site.kind]],
    filter: { label: "Types", of: (site) => site.kind, options: HERITAGE_KINDS, optionLabel: HERITAGE_KIND_LABEL },
  },
  library: {
    layer: "libraries",
    places: LIBRARIES,
    color: "#5fd6a8",
    popupTitle: () => "LIBRARY",
    describe: describeLibrary,
    keywords: (library) => ["library", "NLB", ...(library.branch ? [library.branch] : [])],
  },
  supermarket: {
    layer: "supermarkets",
    places: SUPERMARKETS,
    color: "#d95fb0",
    popupTitle: () => "SUPERMARKET",
    describe: describeSupermarket,
    keywords: (market) => ["supermarket", "grocery", market.brand],
    // "Other" is the unbranded remainder, not a brand, so it stays last.
    filter: { label: "Brands", of: (market) => market.brand, options: SUPERMARKET_BRANDS, byCount: true, last: "Other" },
  },
  school: {
    layer: "schools",
    places: SCHOOLS,
    color: "#a678ff",
    popupTitle: () => "SCHOOL",
    describe: describeSchool,
    keywords: (school) => ["school", SCHOOL_LEVEL_LABEL[school.level]],
    filter: { label: "Levels", of: (school) => school.level, options: SCHOOL_LEVELS, optionLabel: SCHOOL_LEVEL_LABEL },
  },
  healthcare: {
    layer: "healthcare",
    places: HEALTHCARE_SITES,
    color: "#d9553f",
    popupTitle: () => "HEALTHCARE",
    describe: describeHealthcare,
    keywords: (site) => ["healthcare", "clinic", HEALTHCARE_KIND_LABEL[site.kind]],
    // 1,400+ points: draw from city zoom, label at street level.
    minZoom: { points: 11, labels: 15 },
    filter: { label: "Types", of: (site) => site.kind, options: HEALTHCARE_KINDS, optionLabel: HEALTHCARE_KIND_LABEL },
  },
} satisfies { [K in AmenityType]: AmenityDefinition<AmenityPlaces[K]> };

/** The layer keys backed by this registry, e.g. "gyms" | "malls". */
export type AmenityLayerKey = (typeof DEFINITIONS)[AmenityType]["layer"];

export type LayerOption = { readonly value: string; readonly label: string; readonly count: number };

/** Which options of one sub-filter are on; an absent option reads as on. */
export type OptionSelection = Readonly<Record<string, boolean>>;

/** Sub-filter selections for every amenity that has one, keyed by type. */
export type AmenityFilters = Readonly<Partial<Record<AmenityType, OptionSelection>>>;

/** A registry entry with the record type erased, for code that loops over all amenities. */
export type AmenityLayer = Omit<AmenityDefinition<AmenityPlace>, "layer" | "filter"> & {
  readonly type: AmenityType;
  readonly layer: AmenityLayerKey;
  readonly byId: ReadonlyMap<string, AmenityPlace>;
  readonly filter?: SubFilterDefinition<AmenityPlace> & {
    /** Options that have at least one place, with counts, in chip order. */
    readonly choices: ReadonlyArray<LayerOption>;
  };
};

function buildChoices({ of, options, optionLabel, byCount, first, last }: SubFilterDefinition<AmenityPlace>, places: ReadonlyArray<AmenityPlace>): LayerOption[] {
  const counts = new Map<string, number>();
  for (const place of places) counts.set(of(place), (counts.get(of(place)) ?? 0) + 1);
  const pin = (value: string) => (value === first ? -1 : value === last ? 1 : 0);
  return options
    .map((value) => ({ value, label: optionLabel?.[value] ?? value, count: counts.get(value) ?? 0 }))
    .filter((option) => option.count > 0)
    .sort(
      (a, b) =>
        pin(a.value) - pin(b.value) ||
        (byCount ? b.count - a.count || a.value.localeCompare(b.value, "en-SG") : 0),
    );
}

export const AMENITY_LAYERS: ReadonlyArray<AmenityLayer> = (
  Object.entries(DEFINITIONS) as Array<[AmenityType, AmenityDefinition<AmenityPlace> & { layer: AmenityLayerKey }]>
).map(([type, definition]) => ({
  ...definition,
  type,
  byId: new Map(definition.places.map((place) => [place.id, place])),
  filter: definition.filter && {
    ...definition.filter,
    choices: buildChoices(definition.filter, definition.places),
  },
}));

export const AMENITY_LAYER_BY_TYPE: ReadonlyMap<AmenityType, AmenityLayer> = new Map(
  AMENITY_LAYERS.map((amenity) => [amenity.type, amenity]),
);

/** The places a layer shows once its sub-filter (if any) is applied. */
export function visiblePlaces(amenity: AmenityLayer, filters: AmenityFilters): ReadonlyArray<AmenityPlace> {
  const { filter } = amenity;
  const selection = filters[amenity.type];
  if (!filter || !selection) return amenity.places;
  return amenity.places.filter((place) => selection[filter.of(place)] !== false);
}

/** Points this close (centre to centre) are treated as one on-map collision. */
export const AMENITY_COINCIDENCE_THRESHOLD_M = 10;
/** Display-only radius of the ring drawn around a collision group. */
export const AMENITY_COLLISION_RADIUS_M = 24;
/** Keep ring members at least this far apart, widening the ring for big groups. */
const AMENITY_COLLISION_SPACING_M = 12;
const METRES_PER_DEGREE_LAT = (Math.PI / 180) * 6_371_000;

/** Least it takes for the offset maths: a layer name and its points. */
type OffsetLayer = {
  readonly type: string;
  readonly places: ReadonlyArray<{ readonly id: string; readonly lat: number; readonly lng: number }>;
};

/** A display position; never used for popups, search or radius filtering. */
export type AmenityDisplayPoint = { readonly lat: number; readonly lng: number };

/** Display offsets are keyed per amenity type, since ids are only unique within a type. */
export function amenityDisplayKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function metresBetween(a: AmenityDisplayPoint, b: AmenityDisplayPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180 * 6_371_000;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180 * 6_371_000 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

/**
 * Spread co-located points onto a deterministic ring so every dot is visible
 * and clickable. Grouping runs over every registry layer, not just the enabled
 * ones: toggling a layer or sub-filter must not move the markers that remain,
 * so a hidden layer's points still take their places in the ring.
 *
 * Only the returned display positions move. Place records, search results,
 * popups, focus dialogs and radius filtering keep their true coordinates.
 */
export function computeAmenityOffsets(
  layers: ReadonlyArray<OffsetLayer>,
  { thresholdM = AMENITY_COINCIDENCE_THRESHOLD_M, radiusM = AMENITY_COLLISION_RADIUS_M } = {},
): ReadonlyMap<string, AmenityDisplayPoint> {
  const items = layers
    .flatMap((layer, layerIndex) =>
      layer.places.map((place) => ({ ...place, layerIndex, key: amenityDisplayKey(layer.type, place.id) })),
    )
    // Registry order, then id: ring positions are independent of source order.
    .sort((a, b) => a.layerIndex - b.layerIndex || a.id.localeCompare(b.id, "en-SG"));

  const offsets = new Map<string, AmenityDisplayPoint>();
  if (items.length < 2 || thresholdM <= 0) return offsets;

  // Grid-bucket nearby points so ~5k places stay cheap; bucket by a cell a bit
  // wider than the threshold so every neighbour is in the 3x3 block around it.
  const cellLatDeg = (thresholdM * 1.5) / METRES_PER_DEGREE_LAT;
  let maxAbsLat = 0;
  for (const item of items) maxAbsLat = Math.max(maxAbsLat, Math.abs(item.lat));
  const cellLngDeg = cellLatDeg / Math.max(0.2, Math.cos((Math.min(maxAbsLat, 80) * Math.PI) / 180));
  const buckets = new Map<string, number[]>();
  const cellOf = (lat: number, lng: number) => `${Math.floor(lat / cellLatDeg)}:${Math.floor(lng / cellLngDeg)}`;
  items.forEach((item, index) => {
    const key = cellOf(item.lat, item.lng);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(index);
    else buckets.set(key, [index]);
  });

  // Union-find over every pair within the threshold (transitive, so a cluster
  // of nearby points becomes one group rather than overlapping sub-rings).
  const parent = items.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  items.forEach((item, index) => {
    const cellLat = Math.floor(item.lat / cellLatDeg);
    const cellLng = Math.floor(item.lng / cellLngDeg);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (const other of buckets.get(`${cellLat + dy}:${cellLng + dx}`) ?? []) {
          if (other <= index) continue;
          if (metresBetween(item, items[other]) <= thresholdM) {
            const a = find(index);
            const b = find(other);
            if (a !== b) parent[a] = b;
          }
        }
      }
    }
  });

  const groups = new Map<number, number[]>();
  items.forEach((_, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(index);
    else groups.set(root, [index]);
  });

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // Members sit on a ring; enough spacing that each dot keeps its own hit area.
    const ringRadius = Math.max(radiusM, (members.length * AMENITY_COLLISION_SPACING_M) / (2 * Math.PI));
    members.forEach((index, position) => {
      const item = items[index];
      const angle = (2 * Math.PI * position) / members.length;
      const eastM = Math.cos(angle) * ringRadius;
      const northM = Math.sin(angle) * ringRadius;
      const cosLat = Math.max(0.2, Math.cos((item.lat * Math.PI) / 180));
      offsets.set(item.key, {
        lat: item.lat + northM / METRES_PER_DEGREE_LAT,
        lng: item.lng + eastM / (METRES_PER_DEGREE_LAT * cosLat),
      });
    });
  }
  return offsets;
}

/**
 * Display positions for the whole registry, computed once. Every render and
 * source update reads this map, so toggling layers or filters cannot shift a
 * marker: collisions are derived from all layers regardless of visibility.
 */
export const AMENITY_DISPLAY_COORDS: ReadonlyMap<string, AmenityDisplayPoint> = computeAmenityOffsets(AMENITY_LAYERS);

/** The point to draw for a place; its true coordinates when nothing collides. */
export function amenityDisplayPoint(type: AmenityType, place: AmenityPlace): AmenityDisplayPoint {
  return AMENITY_DISPLAY_COORDS.get(amenityDisplayKey(type, place.id)) ?? place;
}

/** A selected amenity resolved to its record, discriminated by `type`. */
export type SelectedAmenity = { [K in AmenityType]: { type: K; place: AmenityPlaces[K] } }[AmenityType];

export function findAmenity(type: AmenityType, id: string): SelectedAmenity | null {
  const place = AMENITY_LAYER_BY_TYPE.get(type)?.byId.get(id);
  return place ? ({ type, place } as SelectedAmenity) : null;
}

export const AMENITY_SEARCH_RESULTS: MapSearchResult[] = AMENITY_LAYERS.flatMap((amenity) =>
  amenity.places.map((place) => ({
    id: place.id,
    type: amenity.type,
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    zoom: 16,
    keywords: [...amenity.keywords(place), ...(place.address ? [place.address] : [])],
  })),
);

/**
 * Hydrate persisted sub-filter selections: per amenity, keep known options
 * and fall back to all-on for anything missing or unusable. A selection that
 * only enables options with no places would hide every chip, so it also falls
 * back to all-on.
 */
export function parseAmenityFilters(stored: unknown): AmenityFilters | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) return undefined;
  const filters: Partial<Record<AmenityType, OptionSelection>> = {};
  for (const { type, filter } of AMENITY_LAYERS) {
    if (!filter) continue;
    const allOn = Object.fromEntries(filter.options.map((option) => [option, true]));
    const selection = parseLayerOptionSelection((stored as Record<string, unknown>)[type], allOn);
    if (!selection) continue;
    filters[type] = filter.choices.some((choice) => selection[choice.value])
      ? selection
      : allOn;
  }
  return filters;
}
