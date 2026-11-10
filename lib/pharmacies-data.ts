import pharmaciesData from "@/public/pharmacies.json";
import type { Pharmacy } from "@/types";

const isPharmacy = (value: unknown): value is Pharmacy => {
  const pharmacy = value as Partial<Pharmacy> | null;
  return (
    typeof pharmacy?.id === "string" &&
    pharmacy.id.length > 0 &&
    typeof pharmacy.name === "string" &&
    pharmacy.name.length > 0 &&
    (pharmacy.address === null || typeof pharmacy.address === "string") &&
    Number.isFinite(pharmacy.lat) &&
    Number.isFinite(pharmacy.lng)
  );
};

export function validatePharmaciesBundle(value: unknown): value is Pharmacy[] {
  return Array.isArray(value) && value.every(isPharmacy);
}

// Built by scripts/fetch-pharmacies.mjs; see that script for sources/licences.
if (!validatePharmaciesBundle(pharmaciesData))
  throw new Error("Invalid pharmacies bundle");
const PHARMACIES = pharmaciesData as Pharmacy[];
export { PHARMACIES };
