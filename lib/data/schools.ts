import schoolsData from "@/public/schools.json";
import {
  isAddressedPlace,
  isNullableHttpUrl,
  isNullableString,
  isOneOf,
} from "@/lib/bundle-validation";
import { SCHOOL_LEVELS, type School } from "@/types";

const isSchool = (value: unknown): value is School => {
  const school = value as Partial<School>;
  return (
    isAddressedPlace(value) &&
    isOneOf(SCHOOL_LEVELS, school.level) &&
    isNullableString(school.postalCode) &&
    isNullableString(school.phone) &&
    isNullableHttpUrl(school.website) &&
    isNullableString(school.mrt) &&
    isNullableString(school.bus) &&
    isOneOf(["onemap", "osm"], school.coordsSource)
  );
};

export function validateSchoolsBundle(value: unknown): value is School[] {
  return Array.isArray(value) && value.every(isSchool);
}

// Built by scripts/fetch-schools.mjs; see that script for sources/licences.
if (!validateSchoolsBundle(schoolsData))
  throw new Error("Invalid schools bundle");
export const SCHOOLS = schoolsData as School[];
