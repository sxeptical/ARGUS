import gymsData from "@/public/gyms.json";
import type { Gym, GymBrand, GymCategory, GymSource } from "@/types";

const GYM_CATEGORIES: ReadonlySet<string> = new Set([
  "gym",
  "yoga",
  "pilates",
  "martial-arts",
  "crossfit",
  "climbing",
  "public",
]);
const GYM_SOURCES: ReadonlySet<string> = new Set([
  "alltheplaces",
  "osm",
  "sportsg",
]);

/** Every operator brand the bundle can carry, in display order. */
export const GYM_BRANDS: readonly GymBrand[] = [
  "ActiveSG",
  "Anytime Fitness",
  "Snap Fitness",
  "F45 Training",
  "Virgin Active",
  "CrossFit",
  "Fitness First",
  "True Fitness",
  "Pure Fitness",
  "UFIT",
  "GymmBoxx",
  "24/7 Fitness",
  "Gold's Gym",
  "EnergyOne",
  "GoFit",
  "Homeground",
  "Spartans",
  "Independent",
];
const GYM_BRAND_SET: ReadonlySet<string> = new Set(GYM_BRANDS);

/** Brand filter defaults: every brand on. */
export const DEFAULT_GYM_BRAND_VISIBILITY: Record<GymBrand, boolean> =
  Object.fromEntries(GYM_BRANDS.map((brand) => [brand, true])) as Record<GymBrand, boolean>;

const isNullableString = (value: unknown) =>
  value === null || typeof value === "string";

const isGym = (value: unknown): value is Gym => {
  const gym = value as Partial<Gym> | null;
  return (
    typeof gym?.id === "string" &&
    gym.id.length > 0 &&
    typeof gym.name === "string" &&
    gym.name.length > 0 &&
    typeof gym.brand === "string" &&
    GYM_BRAND_SET.has(gym.brand) &&
    typeof gym.category === "string" &&
    GYM_CATEGORIES.has(gym.category) &&
    isNullableString(gym.address) &&
    Number.isFinite(gym.lat) &&
    Number.isFinite(gym.lng) &&
    isNullableString(gym.openingHours) &&
    isNullableString(gym.website) &&
    typeof gym.source === "string" &&
    GYM_SOURCES.has(gym.source)
  );
};

export function validateGymsBundle(value: unknown): value is Gym[] {
  return Array.isArray(value) && value.every(isGym);
}

// Built by scripts/fetch-gyms.mjs; see that script for sources/licences.
if (!validateGymsBundle(gymsData))
  throw new Error("Invalid gyms bundle");
const GYMS = gymsData as Gym[];
export { GYMS };
export type { GymBrand, GymCategory, GymSource };
