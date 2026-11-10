import healthcareData from "@/public/healthcare.json";
import { isPhotoList } from "@/lib/amenities-data";
import type { HealthcareKind, HealthcareSite, HealthcareSource } from "@/types";

const HEALTHCARE_SOURCES: ReadonlySet<string> = new Set(["chas", "osm"]);

/** Every healthcare kind the bundle can carry, in display order. */
export const HEALTHCARE_KIND_VALUES: readonly HealthcareKind[] = [
  "gp",
  "hospital",
  "dental",
];
const HEALTHCARE_KIND_SET: ReadonlySet<string> = new Set(HEALTHCARE_KIND_VALUES);

/** Kind filter defaults: every kind on. */
export const DEFAULT_HEALTHCARE_KIND_VISIBILITY: Record<HealthcareKind, boolean> =
  Object.fromEntries(HEALTHCARE_KIND_VALUES.map((kind) => [kind, true])) as Record<HealthcareKind, boolean>;

const isNullableString = (value: unknown) =>
  value === null || typeof value === "string";

const isHealthcareSite = (value: unknown): value is HealthcareSite => {
  const site = value as Partial<HealthcareSite> | null;
  return (
    typeof site?.id === "string" &&
    site.id.length > 0 &&
    typeof site.name === "string" &&
    site.name.length > 0 &&
    typeof site.kind === "string" &&
    HEALTHCARE_KIND_SET.has(site.kind) &&
    isNullableString(site.address) &&
    isNullableString(site.phone) &&
    Array.isArray(site.programmes) &&
    site.programmes.every((programme) => typeof programme === "string") &&
    Number.isFinite(site.lat) &&
    Number.isFinite(site.lng) &&
    isPhotoList(site.photos) &&
    typeof site.source === "string" &&
    HEALTHCARE_SOURCES.has(site.source)
  );
};

export function validateHealthcareBundle(value: unknown): value is HealthcareSite[] {
  return Array.isArray(value) && value.every(isHealthcareSite);
}

// Built by scripts/fetch-healthcare.mjs; see that script for sources/licences.
if (!validateHealthcareBundle(healthcareData))
  throw new Error("Invalid healthcare bundle");
const HEALTHCARE_SITES = healthcareData as HealthcareSite[];
export { HEALTHCARE_SITES };
export type { HealthcareKind, HealthcareSource };
