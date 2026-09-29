import type { BusStop, MapSearchResult } from "@/types";

export function buildBusStopSearchResults(
results: MapSearchResult[], query: string, busStops: BusStop[]): MapSearchResult[] {
  return busStops.map((stop) => ({
    id: stop.BusStopCode,
    type: "bus-stop",
    name: stop.Description,
    lat: stop.Latitude,
    lng: stop.Longitude,
    zoom: 16,
    keywords: [
      stop.BusStopCode,
      stop.RoadName,
    ],
  }));
}