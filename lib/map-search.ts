import { MRT_STATION_GEOJSON } from "@/lib/map-features";
import type { BusStop, MapSearchResult } from "@/types";

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
  }));
}

// Match map marker positions and index interchanges once under all served lines.
function buildMrtStationSearchResults(): MapSearchResult[] {
  const byName = new Map<string, MapSearchResult>();
  for (const station of MRT_STATION_GEOJSON.features) {
    const { name, line } = station.properties;
    const existing = byName.get(name);
    if (existing) {
      existing.keywords.push(line);
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
      keywords: ["mrt", line],
    });
  }
  return Array.from(byName.values());
}

export const MRT_STATION_SEARCH_RESULTS = buildMrtStationSearchResults();
