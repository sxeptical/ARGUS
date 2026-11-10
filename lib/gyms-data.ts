import gymsData from "@/public/gyms.json";
import type { Gym, GymCategory, GymSource } from "@/types";

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

const isNullableString = (value: unknown) =>
  value === null || typeof value === "string";

const isGym = (value: unknown): value is Gym => {
  const gym = value as Partial<Gym> | null;
  return (
    typeof gym?.id === "string" &&
    gym.id.length > 0 &&
    typeof gym.name === "string" &&
    gym.name.length > 0 &&
    isNullableString(gym.brand) &&
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
export type { GymCategory, GymSource };
