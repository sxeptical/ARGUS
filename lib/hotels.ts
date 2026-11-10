/**
 * Popup copy and search entries for the static hotel layer. Pure so the map
 * and tests share one definition.
 */
import { photoCredit } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { Hotel, MapSearchResult } from "@/types";

export const HOTEL_SOURCE_HINT =
  "Source: Hotels Licensing Board via data.gov.sg (Singapore Open Data Licence)";

export const describeHotel = (hotel: Hotel): PopupLine[] => {
  const credit = photoCredit(hotel.photos);
  return [
    { text: hotel.name, kind: "name" },
    { text: "Licensed hotel", kind: "status", tone: "muted" },
    ...(hotel.rooms === null ? [] : [{ text: `${hotel.rooms.toLocaleString("en-SG")} licensed rooms`, kind: "count" as const }]),
    ...(hotel.address ? [{ text: hotel.address, kind: "detail" as const }] : []),
    ...(credit ? [{ text: credit, kind: "hint" as const }] : []),
    { text: HOTEL_SOURCE_HINT, kind: "hint" },
  ];
};

export const buildHotelSearchResults = (hotels: ReadonlyArray<Hotel>): MapSearchResult[] =>
  hotels.map((hotel) => ({
    id: hotel.id,
    type: "hotel",
    name: hotel.name,
    lat: hotel.lat,
    lng: hotel.lng,
    zoom: 16,
    keywords: [
      "hotel",
      "stay",
      ...(hotel.rooms !== null ? [String(hotel.rooms)] : []),
      ...(hotel.address ? [hotel.address] : []),
    ],
  }));
