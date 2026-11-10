/**
 * Popup copy, search entries and kind filtering for the static healthcare
 * layer. Pure so the map, state and tests share one definition.
 */
import { photoCredit } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { HealthcareKind, HealthcareSite, MapSearchResult } from "@/types";

export const HEALTHCARE_KIND_LABEL: Record<HealthcareKind, string> = {
  gp: "GP clinic",
  hospital: "Hospital",
  dental: "Dental clinic",
};

export const HEALTHCARE_SOURCE_HINT: Record<HealthcareSite["source"], string> = {
  chas: "Source: MOH CHAS Clinics via data.gov.sg (Singapore Open Data Licence) · data as of 2021",
  osm: "Location: © OpenStreetMap contributors (ODbL)",
};

export const describeHealthcare = (site: HealthcareSite): PopupLine[] => {
  const credit = photoCredit(site.photos);
  return [
    { text: site.name, kind: "name" },
    { text: HEALTHCARE_KIND_LABEL[site.kind], kind: "status", tone: "muted" },
    ...(site.programmes.length ? [{ text: `Schemes: ${site.programmes.join(" · ")}`, kind: "detail" as const }] : []),
    ...(site.phone ? [{ text: `Tel ${site.phone}`, kind: "detail" as const }] : []),
    ...(site.address ? [{ text: site.address, kind: "detail" as const }] : []),
    ...(credit ? [{ text: credit, kind: "hint" as const }] : []),
    { text: HEALTHCARE_SOURCE_HINT[site.source], kind: "hint" },
  ];
};

export const buildHealthcareSearchResults = (sites: ReadonlyArray<HealthcareSite>): MapSearchResult[] =>
  sites.map((site) => ({
    id: site.id,
    type: "healthcare",
    name: site.name,
    lat: site.lat,
    lng: site.lng,
    zoom: 16,
    keywords: [
      "healthcare",
      "clinic",
      HEALTHCARE_KIND_LABEL[site.kind],
      ...(site.address ? [site.address] : []),
    ],
  }));

/** Healthcare sites whose kind is on (absent from the record means on). */
export const filterHealthcareByKind = (
  sites: ReadonlyArray<HealthcareSite>,
  kindVisible: Readonly<Partial<Record<HealthcareKind, boolean>>>,
): HealthcareSite[] => sites.filter((site) => kindVisible[site.kind] !== false);

export type HealthcareKindCount = { kind: HealthcareKind; count: number };

/** Per-kind counts in display order, for the kind chips. */
export const orderedHealthcareKindCounts = (sites: ReadonlyArray<HealthcareSite>): HealthcareKindCount[] => {
  const counts = new Map<HealthcareKind, number>();
  for (const site of sites) counts.set(site.kind, (counts.get(site.kind) ?? 0) + 1);
  return HEALTHCARE_KIND_ORDER
    .map((kind) => ({ kind: kind as HealthcareKind, count: counts.get(kind as HealthcareKind) ?? 0 }))
    .filter((entry) => entry.count > 0);
};

const HEALTHCARE_KIND_ORDER = ["gp", "hospital", "dental"] as const;
