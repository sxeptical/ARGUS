/**
 * Popup copy and search entries for the static public-library layer. Pure
 * so the map and tests share one definition.
 */
import { photoCredit } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { MapSearchResult, PublicLibrary } from "@/types";

export const LIBRARY_SOURCE_HINT: Record<PublicLibrary["source"], string> = {
  nlb: "Source: National Library Board via data.gov.sg (Singapore Open Data Licence) · data as of 2019",
  osm: "Location: © OpenStreetMap contributors (ODbL)",
};

export const describeLibrary = (library: PublicLibrary): PopupLine[] => {
  const credit = photoCredit(library.photos);
  return [
    { text: library.name, kind: "name" },
    { text: "Public library", kind: "status", tone: "muted" },
    ...(library.branch ? [{ text: `Branch ${library.branch}`, kind: "count" as const }] : []),
    ...(library.address ? [{ text: library.address, kind: "detail" as const }] : []),
    ...(credit ? [{ text: credit, kind: "hint" as const }] : []),
    { text: LIBRARY_SOURCE_HINT[library.source], kind: "hint" },
  ];
};

export const buildLibrarySearchResults = (libraries: ReadonlyArray<PublicLibrary>): MapSearchResult[] =>
  libraries.map((library) => ({
    id: library.id,
    type: "library",
    name: library.name,
    lat: library.lat,
    lng: library.lng,
    zoom: 16,
    keywords: [
      "library",
      "NLB",
      ...(library.branch ? [library.branch] : []),
      ...(library.address ? [library.address] : []),
    ],
  }));
