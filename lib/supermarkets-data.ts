import supermarketsData from "@/public/supermarkets.json";
import type { Supermarket, SupermarketBrand } from "@/types";

/** Every operator brand the bundle can carry, in display order. */
export const SUPERMARKET_BRANDS: readonly SupermarketBrand[] = [
  "NTUC FairPrice",
  "Cold Storage",
  "Sheng Siong",
  "Giant",
  "Prime",
  "Don Don Donki",
  "Ang Mo",
  "U Stars",
  "Hao Mart",
  "Scarlett",
  "Other",
];
const SUPERMARKET_BRAND_SET: ReadonlySet<string> = new Set(SUPERMARKET_BRANDS);

/** Brand filter defaults: every brand on. */
export const DEFAULT_SUPERMARKET_BRAND_VISIBILITY: Record<SupermarketBrand, boolean> =
  Object.fromEntries(SUPERMARKET_BRANDS.map((brand) => [brand, true])) as Record<SupermarketBrand, boolean>;

const isNullableString = (value: unknown) =>
  value === null || typeof value === "string";

const isSupermarket = (value: unknown): value is Supermarket => {
  const market = value as Partial<Supermarket> | null;
  return (
    typeof market?.id === "string" &&
    market.id.length > 0 &&
    typeof market.name === "string" &&
    market.name.length > 0 &&
    typeof market.brand === "string" &&
    SUPERMARKET_BRAND_SET.has(market.brand) &&
    isNullableString(market.address) &&
    Number.isFinite(market.lat) &&
    Number.isFinite(market.lng) &&
    isNullableString(market.openingHours) &&
    isNullableString(market.website)
  );
};

export function validateSupermarketsBundle(value: unknown): value is Supermarket[] {
  return Array.isArray(value) && value.every(isSupermarket);
}

// Built by scripts/fetch-supermarkets.mjs; see that script for sources/licences.
if (!validateSupermarketsBundle(supermarketsData))
  throw new Error("Invalid supermarkets bundle");
const SUPERMARKETS = supermarketsData as Supermarket[];
export { SUPERMARKETS };
export type { SupermarketBrand };
