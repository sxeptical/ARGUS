/**
 * Labels and popup copy for the static heritage layer. Search and the
 * kind sub-filter are declared in lib/amenity-layers.ts.
 */
import { photoCredit } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { HeritageKind, HeritageSite } from "@/types";

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
