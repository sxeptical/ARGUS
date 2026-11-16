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
  polytechnic: "Polytechnic",
  university: "University",
};

/** What the place is, e.g. "Primary school", "Polytechnic". */
export const SCHOOL_KIND_LABEL: Record<SchoolLevel, string> = {
  primary: "Primary school",
  secondary: "Secondary school",
  jc: "JC school",
  mixed: "Mixed school",
  polytechnic: "Polytechnic",
  university: "University",
};

export const isHigherLearning = (level: SchoolLevel) => level === "polytechnic" || level === "university";

export const SCHOOL_SOURCE_HINT =
  "Source: Ministry of Education via data.gov.sg (Singapore Open Data Licence)";
export const HIGHER_LEARNING_SOURCE_HINT =
  "Source: curated list of autonomous universities and polytechnics; location via OneMap";

export const schoolSourceHint = (school: School) =>
  isHigherLearning(school.level) ? HIGHER_LEARNING_SOURCE_HINT : SCHOOL_SOURCE_HINT;

export const describeSchool = (school: School): PopupLine[] => [
  { text: school.name, kind: "name" },
  { text: SCHOOL_KIND_LABEL[school.level], kind: "status", tone: "muted" },
  ...(school.address ? [{ text: school.address, kind: "detail" as const }] : []),
  ...(school.phone ? [{ text: `Tel ${school.phone}`, kind: "detail" as const }] : []),
  ...(school.mrt ? [{ text: `MRT: ${school.mrt}`, kind: "detail" as const }] : []),
  ...(school.bus ? [{ text: `Bus: ${school.bus}`, kind: "detail" as const }] : []),
  { text: schoolSourceHint(school), kind: "hint" },
];
