/**
 * Popup copy, search entries and kind filtering for the static heritage
 * layer. Pure so the map, state and tests share one definition.
 */
import { photoCredit } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { HeritageKind, HeritageSite, MapSearchResult } from "@/types";

export const HERITAGE_KIND_LABEL: Record<HeritageKind, string> = {
  "historic-site": "Historic site",
  monument: "National monument",
  museum: "Museum",
};

export const HERITAGE_SOURCE_HINT: Record<HeritageSite["source"], string> = {
  nhb: "Source: National Heritage Board via data.gov.sg (Singapore Open Data Licence)",
  osm: "Location: © OpenStreetMap contributors (ODbL)",
};

export const describeHeritage = (site: HeritageSite): PopupLine[] => {
  const credit = photoCredit(site.photos);
  return [
    { text: site.name, kind: "name" },
    { text: HERITAGE_KIND_LABEL[site.kind], kind: "status", tone: "muted" },
    ...(site.description ? [{ text: site.description, kind: "detail" as const }] : []),
    ...(site.address ? [{ text: site.address, kind: "detail" as const }] : []),
    ...(credit ? [{ text: credit, kind: "hint" as const }] : []),
    { text: HERITAGE_SOURCE_HINT[site.source], kind: "hint" },
  ];
};

export const buildHeritageSearchResults = (sites: ReadonlyArray<HeritageSite>): MapSearchResult[] =>
  sites.map((site) => ({
    id: site.id,
    type: "heritage",
    name: site.name,
    lat: site.lat,
    lng: site.lng,
    zoom: 16,
    keywords: [
      "heritage",
      HERITAGE_KIND_LABEL[site.kind],
      ...(site.address ? [site.address] : []),
    ],
  }));

/** Heritage sites whose kind is on (absent from the record means on). */
export const filterHeritageByKind = (
  sites: ReadonlyArray<HeritageSite>,
  kindVisible: Readonly<Partial<Record<HeritageKind, boolean>>>,
): HeritageSite[] => sites.filter((site) => kindVisible[site.kind] !== false);

export type HeritageKindCount = { kind: HeritageKind; count: number };

/** Per-kind counts in display order, for the kind chips. */
export const orderedHeritageKindCounts = (sites: ReadonlyArray<HeritageSite>): HeritageKindCount[] => {
  const counts = new Map<HeritageKind, number>();
  for (const site of sites) counts.set(site.kind, (counts.get(site.kind) ?? 0) + 1);
  return ["historic-site", "monument", "museum"]
    .map((kind) => ({ kind: kind as HeritageKind, count: counts.get(kind as HeritageKind) ?? 0 }))
    .filter((entry) => entry.count > 0);
};
