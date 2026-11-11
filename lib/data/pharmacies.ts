import pharmaciesData from "@/public/pharmacies.json";
import { isAddressedPlace } from "@/lib/bundle-validation";
import type { Pharmacy } from "@/types";

export function validatePharmaciesBundle(value: unknown): value is Pharmacy[] {
  return Array.isArray(value) && value.every(isAddressedPlace);
}

// Built by scripts/fetch-pharmacies.mjs; see that script for sources/licences.
if (!validatePharmaciesBundle(pharmaciesData))
  throw new Error("Invalid pharmacies bundle");
export const PHARMACIES: Pharmacy[] = pharmaciesData;
