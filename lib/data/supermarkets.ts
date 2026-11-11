import supermarketsData from "@/public/supermarkets.json";
import {
  isAddressedPlace,
  isNullableHttpUrl,
  isNullableString,
  isOneOf,
} from "@/lib/bundle-validation";
import { SUPERMARKET_BRANDS, type Supermarket } from "@/types";

const isSupermarket = (value: unknown): value is Supermarket => {
  const market = value as Partial<Supermarket>;
  return (
    isAddressedPlace(value) &&
    isOneOf(SUPERMARKET_BRANDS, market.brand) &&
    isNullableString(market.openingHours) &&
    isNullableHttpUrl(market.website)
  );
};

export function validateSupermarketsBundle(value: unknown): value is Supermarket[] {
  return Array.isArray(value) && value.every(isSupermarket);
}

// Built by scripts/fetch-supermarkets.mjs; see that script for sources/licences.
if (!validateSupermarketsBundle(supermarketsData))
  throw new Error("Invalid supermarkets bundle");
export const SUPERMARKETS = supermarketsData as Supermarket[];
