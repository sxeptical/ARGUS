import parksData from "@/public/parks-geometry.json";
import { areaHectares, formatParkName, parkLabelPoint } from "@/lib/parks";
import type { ParksGeoJson } from "@/types";

export function validateParksGeoJson(value: unknown): value is ParksGeoJson {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ParksGeoJson>;
  return data.type === "FeatureCollection" && Array.isArray(data.features) && data.features.every((feature) => {
    const properties = feature?.properties;
    return ["park", "pcn", "trail"].includes(properties?.kind) && typeof properties?.name === "string" && properties.name.length > 0;
  });
}

if (!validateParksGeoJson(parksData)) throw new Error("Invalid parks geometry bundle");
// NParks names are often all-caps abbreviations ("ADMIRALTY PK"); expose
// readable names everywhere, and each park's size for labels and popups.
export const PARKS_GEOJSON: ParksGeoJson = {
  type: "FeatureCollection",
  features: (parksData as ParksGeoJson).features.map((feature) => {
    const { kind, name, park } = feature.properties;
    return {
      ...feature,
      properties: {
        ...feature.properties,
        name: formatParkName(name),
        ...(park ? { park: formatParkName(park) } : {}),
        ...(kind === "park" ? { areaHa: Math.round(areaHectares(feature.geometry) * 10) / 10 } : {}),
      },
    };
  }),
};
export const PARK_COUNT = PARKS_GEOJSON.features.filter((feature) => feature.properties.kind === "park").length;
export const TRAIL_COUNT = PARKS_GEOJSON.features.filter((feature) => feature.properties.kind !== "park").length;

/** One label point per park, so long parks aren't labelled once per map tile. */
export const PARK_LABELS_GEOJSON = {
  type: "FeatureCollection" as const,
  features: PARKS_GEOJSON.features.flatMap((feature) => {
    if (feature.properties.kind !== "park") return [];
    const point = parkLabelPoint(feature.geometry);
    return point
      ? [{
          type: "Feature" as const,
          properties: { name: feature.properties.name, areaHa: feature.properties.areaHa ?? 0 },
          geometry: { type: "Point" as const, coordinates: point },
        }]
      : [];
  }),
};
