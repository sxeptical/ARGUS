/**
 * Display helpers for the NParks recreation layer: readable names, park
 * sizes, popup copy, and search entries. Pure so the map and tests share them.
 */
import type { PopupLine } from "@/lib/mobility";
import type { MapSearchResult, ParkFeatureKind, ParksGeoJson } from "@/types";

// NParks abbreviations, expanded wherever they appear.
const ABBREVIATIONS: Record<string, string> = {
  PK: "Park",
  PG: "Playground",
  PC: "Park Connector",
  RD: "Road",
  AVE: "Avenue",
  DR: "Drive",
  JLN: "Jalan",
  UPP: "Upper",
  BTWN: "between",
  GDNS: "Gardens",
  NTH: "North",
  STH: "South",
  CTRL: "Central",
};
// Expressway and place codes that stay upper-case in an otherwise title-cased name.
const ACRONYMS = new Set(["AYE", "BKE", "CTE", "ECP", "KJE", "KPE", "MCE", "PIE", "SLE", "TPE", "MRT", "LRT", "PUB", "SBG", "JLG", "YCK", "HDB", "NS", "EW"]);

// Joining words stay lower-case mid-name ("Ave 1 (CTE to Upper Thomson)").
const SMALL_WORDS = new Set(["TO", "AND", "OF", "THE", "AT", "NEAR"]);

const titleCase = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/**
 * "ADMIRALTY PK" → "Admiralty Park", "Bukit Timah PC (btwn King Albert Park -
 * Adam Rd)" → "Bukit Timah Park Connector (between King Albert Park - Adam
 * Road)". All-caps names are title-cased; known codes stay caps.
 */
export function formatParkName(raw: string): string {
  const shouting = raw === raw.toUpperCase();
  let depth = 0;
  return raw.replace(/[()]|[A-Za-z]+/g, (token, offset: number) => {
    if (token === "(") depth += 1;
    if (token === ")") depth = Math.max(0, depth - 1);
    if (token === "(" || token === ")") return token;
    const upper = token.toUpperCase();
    const expanded = ABBREVIATIONS[upper];
    if (expanded) return expanded;
    if (!shouting) return token;
    if (offset > 0 && SMALL_WORDS.has(upper)) return token.toLowerCase();
    // Vowel-less bracketed codes are abbreviations: "(FCP)", "(AMK ...)".
    if (ACRONYMS.has(upper) || (depth > 0 && token.length <= 3 && !/[AEIOU]/.test(upper))) return upper;
    return titleCase(token);
  }).trim();
}

type Ring = number[][];

// Equirectangular metres at Singapore's latitude: accurate to well under 1%
// for park-sized polygons.
const METRES_PER_DEGREE_LAT = 110_574;
const METRES_PER_DEGREE_LNG = 111_320 * Math.cos((1.35 * Math.PI) / 180);

const ringArea = (ring: Ring) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * METRES_PER_DEGREE_LNG) * (ring[i][1] * METRES_PER_DEGREE_LAT) -
      (ring[i][0] * METRES_PER_DEGREE_LNG) * (ring[j][1] * METRES_PER_DEGREE_LAT);
  }
  return Math.abs(sum) / 2;
};
const polygonArea = (rings: Ring[]) => (rings.length ? ringArea(rings[0]) - rings.slice(1).reduce((sum, hole) => sum + ringArea(hole), 0) : 0);

/** Area in hectares of a Polygon / MultiPolygon geometry; 0 for lines. */
export function areaHectares(geometry: ParksGeoJson["features"][number]["geometry"]): number {
  const square = geometry.type === "Polygon"
    ? polygonArea(geometry.coordinates as Ring[])
    : geometry.type === "MultiPolygon"
      ? (geometry.coordinates as Ring[][]).reduce((sum, polygon) => sum + polygonArea(polygon), 0)
      : 0;
  return square / 10_000;
}

const formatHectares = (hectares: number) =>
  hectares >= 10 ? `${Math.round(hectares).toLocaleString("en-SG")} ha` : `${hectares.toFixed(1)} ha`;

export const PARK_KIND_TITLE: Record<ParkFeatureKind, string> = {
  park: "PARK",
  pcn: "PARK CONNECTOR",
  trail: "TRAIL",
};

export type ParkFeatureDetails = {
  kind: ParkFeatureKind;
  name: string;
  park?: string;
  type?: string;
  cycle?: boolean;
  areaHa?: number;
};

/** Plain-language popup lines explaining what the hovered feature is. */
export function describeParkFeature(feature: ParkFeatureDetails): PopupLine[] {
  const lines: PopupLine[] = [{ text: feature.name, kind: "name" }];
  if (feature.kind === "park") {
    lines.push({ text: "Public park or nature area", kind: "status", tone: "success" });
    if (feature.areaHa) lines.push({ text: `About ${formatHectares(feature.areaHa)}`, kind: "count" });
  } else if (feature.kind === "pcn") {
    lines.push({ text: "Walking, running and cycling path", kind: "status", tone: "success" });
    lines.push({ text: "Part of the island-wide network linking parks together", kind: "detail" });
  } else {
    lines.push({ text: feature.cycle ? "Walking and cycling" : "Walking only", kind: "status", tone: "success" });
    if (feature.type) lines.push({ text: feature.type, kind: "count" });
    if (feature.park && feature.park !== feature.name) lines.push({ text: `In ${feature.park}`, kind: "detail" });
  }
  lines.push({ text: "Source: NParks via data.gov.sg", kind: "hint" });
  return lines;
}

const pointInRing = ([x, y]: number[], ring: Ring) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

/**
 * One point to label / search-jump to for a park: its bounding-box centre when
 * that falls inside the park, else the park's boundary vertex nearest to it
 * (long thin parks like the Rail Corridor have their centre off the park).
 */
export function parkLabelPoint(geometry: ParksGeoJson["features"][number]["geometry"]): [number, number] | null {
  const centre = bboxCentre(geometry.coordinates);
  if (!centre) return null;
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as Ring[]]
    : geometry.type === "MultiPolygon" ? (geometry.coordinates as Ring[][]) : [];
  if (polygons.some((rings) => rings[0] && pointInRing(centre, rings[0]) && !rings.slice(1).some((hole) => pointInRing(centre, hole)))) {
    return centre;
  }
  let best: [number, number] | null = null;
  let bestDistance = Infinity;
  for (const rings of polygons) {
    for (const [lng, lat] of rings[0] ?? []) {
      const distance = Math.hypot(lng - centre[0], lat - centre[1]);
      if (distance < bestDistance) [best, bestDistance] = [[lng, lat], distance];
    }
  }
  return best ?? centre;
}

const bboxCentre = (coordinates: unknown): [number, number] | null => {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  const visit = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number") {
      const [lng, lat] = value as number[];
      minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      return;
    }
    value.forEach(visit);
  };
  visit(coordinates);
  return Number.isFinite(minLng) ? [(minLng + maxLng) / 2, (minLat + maxLat) / 2] : null;
};

/** One search entry per park area (not per connector or trail segment). */
export function buildParkSearchResults(parks: ParksGeoJson): MapSearchResult[] {
  return parks.features.flatMap((feature) => {
    if (feature.properties.kind !== "park") return [];
    const centre = parkLabelPoint(feature.geometry);
    if (!centre) return [];
    const large = (feature.properties.areaHa ?? 0) >= 50;
    return [{
      id: `park:${feature.properties.name}`,
      type: "park" as const,
      name: feature.properties.name,
      lat: centre[1],
      lng: centre[0],
      zoom: large ? 13.5 : 16,
      keywords: ["park", "nparks", "garden"],
    }];
  });
}
