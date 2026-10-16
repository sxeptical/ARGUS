import type { BusStop, MapSearchResult, MRTGeoJson } from "@/types";
import mrtLinesData from "@/public/mrt-lines.json";
import { interpolateStations } from "@/lib/map-geometry";
import { MRT_DISPLAY_LINE_STATIONS } from "@/lib/mrt-network";

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

// Uses the same approximate station positions the map draws, so a search
// result lands on the station marker. Interchanges appear once, keyed by name,
// with every line they serve as keywords.
function buildMrtStationSearchResults(): MapSearchResult[] {
  const byName = new Map<string, MapSearchResult>();
  for (const lineFeature of (mrtLinesData as MRTGeoJson).features) {
    const line = lineFeature.properties.name;
    const stations = interpolateStations(
      lineFeature.geometry.coordinates,
      MRT_DISPLAY_LINE_STATIONS[line] ?? [],
      line,
      lineFeature.properties.color,
    );
    for (const station of stations) {
      const name = station.properties.name;
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
  }
  return Array.from(byName.values());
}

export const MRT_STATION_SEARCH_RESULTS = buildMrtStationSearchResults();
