import healthcareData from "@/public/healthcare.json";
import { isAddressedPlace, isNullableString, isOneOf, isPhotoList } from "@/lib/bundle-validation";
import { HEALTHCARE_KINDS, type HealthcareSite } from "@/types";

const isHealthcareSite = (value: unknown): value is HealthcareSite => {
  const site = value as Partial<HealthcareSite>;
  return (
    isAddressedPlace(value) &&
    isOneOf(HEALTHCARE_KINDS, site.kind) &&
    isNullableString(site.phone) &&
    Array.isArray(site.programmes) &&
    site.programmes.every((programme) => typeof programme === "string") &&
    isPhotoList(site.photos) &&
    isOneOf(["chas", "osm"], site.source)
  );
};

export function validateHealthcareBundle(value: unknown): value is HealthcareSite[] {
  return Array.isArray(value) && value.every(isHealthcareSite);
}

// Built by scripts/fetch-healthcare.mjs; see that script for sources/licences.
if (!validateHealthcareBundle(healthcareData))
  throw new Error("Invalid healthcare bundle");
export const HEALTHCARE_SITES = healthcareData as HealthcareSite[];
