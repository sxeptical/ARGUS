import schoolsData from "@/public/schools.json";
import type { School, SchoolLevel } from "@/types";

/** Every level the bundle can carry, in display order. */
export const SCHOOL_LEVEL_VALUES: readonly SchoolLevel[] = [
  "primary",
  "secondary",
  "jc",
  "mixed",
];
const SCHOOL_LEVEL_SET: ReadonlySet<string> = new Set(SCHOOL_LEVEL_VALUES);

/** Level filter defaults: every level on. */
export const DEFAULT_SCHOOL_LEVEL_VISIBILITY: Record<SchoolLevel, boolean> =
  Object.fromEntries(SCHOOL_LEVEL_VALUES.map((level) => [level, true])) as Record<SchoolLevel, boolean>;

const isNullableString = (value: unknown) =>
  value === null || typeof value === "string";

const isSchool = (value: unknown): value is School => {
  const school = value as Partial<School> | null;
  return (
    typeof school?.id === "string" &&
    school.id.length > 0 &&
    typeof school.name === "string" &&
    school.name.length > 0 &&
    typeof school.level === "string" &&
    SCHOOL_LEVEL_SET.has(school.level) &&
    isNullableString(school.address) &&
    isNullableString(school.postalCode) &&
    isNullableString(school.phone) &&
    isNullableString(school.website) &&
    isNullableString(school.mrt) &&
    isNullableString(school.bus) &&
    Number.isFinite(school.lat) &&
    Number.isFinite(school.lng) &&
    (school.coordsSource === "onemap" || school.coordsSource === "osm")
  );
};

export function validateSchoolsBundle(value: unknown): value is School[] {
  return Array.isArray(value) && value.every(isSchool);
}

// Built by scripts/fetch-schools.mjs; see that script for sources/licences.
if (!validateSchoolsBundle(schoolsData))
  throw new Error("Invalid schools bundle");
const SCHOOLS = schoolsData as School[];
export { SCHOOLS };
export type { SchoolLevel };
