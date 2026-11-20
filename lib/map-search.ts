import { AMENITY_LAYER_BY_TYPE, passesSubFilter, type AmenityFilters } from "@/lib/amenity-layers";
import type { SensorKey } from "@/lib/layers";
import { MRT_STATION_GEOJSON } from "@/lib/map-features";
import type { AmenityType, BusStop, MapSearchResult, SearchResultType } from "@/types";

export function buildBusStopSearchResults(
  busStops: BusStop[],
): MapSearchResult[] {
  return busStops.map((stop) => ({
    id: stop.BusStopCode,
    type: "bus-stop",
    name: stop.Description,
    lat: stop.Latitude,
    lng: stop.Longitude,
    zoom: 16,
    keywords: [stop.BusStopCode, stop.RoadName],
    detail: `${stop.BusStopCode} · ${stop.RoadName}`,
  }));
}

/**
 * Short codes for the line pills on station results, as on the LTA system map.
 * Branches, extensions and LRT loops share their parent line's pill.
 */
const MRT_LINE_CODE: Record<string, string> = {
  "North South Line": "NSL",
  "East West Line": "EWL",
  "Changi Airport Branch": "EWL",
  "North East Line": "NEL",
  "Circle Line": "CCL",
  "Circle Line Extension": "CCL",
  "Downtown Line": "DTL",
  "Downtown Line Extension": "DTL",
  "Thomson-East Coast Line": "TEL",
  "Thomson-East Coast Line Extension": "TEL",
  "Cross Island Line": "CRL",
  "Jurong Region Line": "JRL",
  "Jurong Region Line East Branch": "JRL",
  "Jurong Region Line West Branch": "JRL",
  "Jurong Region Line West Coast Extension": "JRL",
  "Bukit Panjang LRT": "BP",
  "Sengkang LRT East Loop": "STC",
  "Sengkang LRT West Loop": "STC",
  "Punggol LRT East Loop": "PTC",
  "Punggol LRT West Loop": "PTC",
  "Johor Bahru-Singapore RTS": "RTS",
};
const MRT_LINE_ORDER = [...new Set(Object.values(MRT_LINE_CODE))];

// Match map marker positions and index interchanges once under all served lines.
function buildMrtStationSearchResults(): MapSearchResult[] {
  const byName = new Map<string, MapSearchResult>();
  for (const station of MRT_STATION_GEOJSON.features) {
    const { name, line, color } = station.properties;
    const code = MRT_LINE_CODE[line] ?? line;
    const existing = byName.get(name);
    if (existing) {
      existing.keywords.push(line, code);
      if (!existing.badges!.some((badge) => badge.label === code)) existing.badges!.push({ label: code, color });
      continue;
    }
    const [lng, lat] = station.geometry.coordinates;
    byName.set(name, {
      id: name,
      type: "mrt",
      name,
      lat,
      lng,
      zoom: 15,
      keywords: ["mrt", line, code],
      badges: [{ label: code, color }],
    });
  }
  const results = Array.from(byName.values());
  for (const result of results) {
    result.badges!.sort((a, b) => MRT_LINE_ORDER.indexOf(a.label) - MRT_LINE_ORDER.indexOf(b.label));
  }
  return results;
}

export const MRT_STATION_SEARCH_RESULTS = buildMrtStationSearchResults();

/** Category names for the search pills, in pill order. */
export const SEARCH_TYPE_LABEL: Record<SearchResultType, string> = {
  mrt: "MRT",
  "bus-stop": "Bus stops",
  park: "Parks",
  mall: "Malls",
  hawker: "Hawker",
  supermarket: "Supermarkets",
  "community-club": "Community clubs",
  library: "Libraries",
  gym: "Gyms",
  school: "Schools",
  healthcare: "Healthcare",
  pharmacy: "Pharmacies",
  hotel: "Hotels",
  heritage: "Heritage",
};

const SEARCH_TYPE_ORDER = Object.keys(SEARCH_TYPE_LABEL) as SearchResultType[];

/** The map marker colour token for a result type. */
export const searchTypeColor = (type: SearchResultType) =>
  `var(--signal-${type === "bus-stop" ? "bus" : type})`;

export type SearchMatch = {
  result: MapSearchResult;
  /** Where the query sits in the name, for highlighting; null when only a keyword matched. */
  nameMatch: { start: number; end: number } | null;
};

/** Results whose name or a keyword contains the query, in their given order. */
export function matchSearchResults(
  results: MapSearchResult[],
  rawQuery: string,
): SearchMatch[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];
  return results.flatMap((result): SearchMatch[] => {
    const start = result.name.toLowerCase().indexOf(query);
    if (start >= 0)
      return [{ result, nameMatch: { start, end: start + query.length } }];
    return result.keywords.some((keyword) =>
      keyword.toLowerCase().includes(query),
    )
      ? [{ result, nameMatch: null }]
      : [];
  });
}

/** Count results per type, in pill order, skipping empty types. */
export function countSearchTypes(
  matches: { result: MapSearchResult }[],
): { type: SearchResultType; count: number }[] {
  const counts = new Map<SearchResultType, number>();
  for (const { result } of matches)
    counts.set(result.type, (counts.get(result.type) ?? 0) + 1);
  return SEARCH_TYPE_ORDER.flatMap((type) =>
    counts.has(type) ? [{ type, count: counts.get(type)! }] : [],
  );
}

/** Everything in one category, or every result when none is chosen, A–Z, for browsing before typing. */
export function browseSearchResults(
  results: MapSearchResult[],
  category: SearchResultType | null,
): MapSearchResult[] {
  return results
    .filter((result) => category === null || result.type === category)
    .sort((a, b) => a.name.localeCompare(b.name, "en-SG"));
}

/** The map layer that draws a result type; search skips types whose layer is off. */
export function searchResultLayer(type: SearchResultType): SensorKey {
  if (type === "mrt") return "mrt";
  if (type === "bus-stop") return "busStops";
  if (type === "park") return "parks";
  return AMENITY_LAYER_BY_TYPE.get(type as AmenityType)!.layer;
}

/**
 * Whether the map draws a result: its layer is on and, for amenities with a
 * sub-filter (gym brands, school levels, ...), its option is checked.
 */
export function isSearchResultShown(
  result: MapSearchResult,
  visibility: Readonly<Record<SensorKey, boolean>>,
  filters: AmenityFilters,
): boolean {
  if (!visibility[searchResultLayer(result.type)]) return false;
  const amenity = AMENITY_LAYER_BY_TYPE.get(result.type as AmenityType);
  const place = amenity?.byId.get(result.id);
  return !amenity || !place || passesSubFilter(amenity, filters, place);
}
