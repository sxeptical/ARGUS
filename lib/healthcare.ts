/**
 * Labels and popup copy for the static healthcare layer. Search and the
 * kind sub-filter are declared in lib/amenity-layers.ts.
 */
import { photoCredit } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { HealthcareKind, HealthcareSite } from "@/types";

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
