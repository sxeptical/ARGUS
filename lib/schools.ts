/**
 * Labels and popup copy for the static schools layer. Search and the
 * level sub-filter are declared in lib/amenity-layers.ts.
 */
import type { PopupLine } from "@/lib/mobility";
import type { School, SchoolLevel } from "@/types";

export const SCHOOL_LEVEL_LABEL: Record<SchoolLevel, string> = {
  primary: "Primary",
  secondary: "Secondary",
  jc: "JC",
  mixed: "Mixed",
};

export const SCHOOL_SOURCE_HINT =
  "Source: Ministry of Education via data.gov.sg (Singapore Open Data Licence)";

export const describeSchool = (school: School): PopupLine[] => [
  { text: school.name, kind: "name" },
  { text: `${SCHOOL_LEVEL_LABEL[school.level]} school`, kind: "status", tone: "muted" },
  ...(school.address ? [{ text: school.address, kind: "detail" as const }] : []),
  ...(school.phone ? [{ text: `Tel ${school.phone}`, kind: "detail" as const }] : []),
  ...(school.mrt ? [{ text: `MRT: ${school.mrt}`, kind: "detail" as const }] : []),
  ...(school.bus ? [{ text: `Bus: ${school.bus}`, kind: "detail" as const }] : []),
  { text: SCHOOL_SOURCE_HINT, kind: "hint" },
];
