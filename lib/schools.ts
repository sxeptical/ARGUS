/**
 * Popup copy, search entries and level filtering for the static MOE
 * schools layer. Pure so the map, state and tests share one definition.
 */
import type { PopupLine } from "@/lib/mobility";
import type { MapSearchResult, School, SchoolLevel } from "@/types";

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

export const buildSchoolSearchResults = (schools: ReadonlyArray<School>): MapSearchResult[] =>
  schools.map((school) => ({
    id: school.id,
    type: "school",
    name: school.name,
    lat: school.lat,
    lng: school.lng,
    zoom: 16,
    keywords: [
      "school",
      SCHOOL_LEVEL_LABEL[school.level],
      school.name.toLowerCase(),
      ...(school.address ? [school.address] : []),
    ],
  }));

/** Schools whose level is on (absent from the record means on). */
export const filterSchoolsByLevel = (
  schools: ReadonlyArray<School>,
  levelVisible: Readonly<Partial<Record<SchoolLevel, boolean>>>,
): School[] => schools.filter((school) => levelVisible[school.level] !== false);

export type SchoolLevelCount = { level: SchoolLevel; count: number };

/** Per-level counts in display order, for the level chips. */
export const orderedSchoolLevelCounts = (schools: ReadonlyArray<School>): SchoolLevelCount[] => {
  const counts = new Map<SchoolLevel, number>();
  for (const school of schools) counts.set(school.level, (counts.get(school.level) ?? 0) + 1);
  return ["primary", "secondary", "jc", "mixed"]
    .map((level) => ({ level: level as SchoolLevel, count: counts.get(level as SchoolLevel) ?? 0 }))
    .filter((entry) => entry.count > 0);
};
