import parksData from "@/public/parks-geometry.json";
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
export const PARKS_GEOJSON = parksData as ParksGeoJson;
export const PARK_COUNT = PARKS_GEOJSON.features.filter((feature) => feature.properties.kind === "park").length;
export const TRAIL_COUNT = PARKS_GEOJSON.features.filter((feature) => feature.properties.kind !== "park").length;
