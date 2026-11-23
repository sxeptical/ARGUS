import forecastAreasData from "@/public/forecast-areas-geometry.json";

export type ForecastAreaGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

export type ForecastAreasGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { name: string };
    geometry: ForecastAreaGeometry;
  }>;
};

export function validateForecastAreasGeoJson(
  value: unknown,
): value is ForecastAreasGeoJson {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<ForecastAreasGeoJson>;
  return (
    data.type === "FeatureCollection" &&
    Array.isArray(data.features) &&
    data.features.every((feature) => {
      const name = feature?.properties?.name;
      const type = feature?.geometry?.type;
      return (
        typeof name === "string" &&
        name.length > 0 &&
        (type === "Polygon" || type === "MultiPolygon") &&
        Array.isArray(feature.geometry.coordinates) &&
        feature.geometry.coordinates.length > 0
      );
    })
  );
}

if (!validateForecastAreasGeoJson(forecastAreasData)) {
  throw new Error("Invalid forecast areas geometry bundle");
}

export const FORECAST_AREAS_GEOJSON = forecastAreasData as ForecastAreasGeoJson;

export const FORECAST_AREA_GEOMETRY_BY_NAME: ReadonlyMap<
  string,
  ForecastAreaGeometry
> = new Map(
  FORECAST_AREAS_GEOJSON.features.map((feature) => [
    feature.properties.name.toLowerCase(),
    feature.geometry,
  ]),
);
