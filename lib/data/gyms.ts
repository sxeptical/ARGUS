import gymsData from "@/public/gyms.json";
import {
  isAddressedPlace,
  isNullableHttpUrl,
  isNullableString,
  isOneOf,
} from "@/lib/bundle-validation";
import {
  GYM_BRANDS,
  GYM_CATEGORIES,
  GYM_SOURCES,
  type Gym,
} from "@/types";

const isGym = (value: unknown): value is Gym => {
  const gym = value as Partial<Gym>;
  return (
    isAddressedPlace(value) &&
    isOneOf(GYM_BRANDS, gym.brand) &&
    isOneOf(GYM_CATEGORIES, gym.category) &&
    isNullableString(gym.openingHours) &&
    isNullableHttpUrl(gym.website) &&
    (gym.aliases === undefined ||
      (Array.isArray(gym.aliases) && gym.aliases.every((alias) => typeof alias === "string"))) &&
    isOneOf(GYM_SOURCES, gym.source)
  );
};

export function validateGymsBundle(value: unknown): value is Gym[] {
  return Array.isArray(value) && value.every(isGym);
}

// Built by scripts/fetch-gyms.mjs; see that script for sources/licences.
if (!validateGymsBundle(gymsData))
  throw new Error("Invalid gyms bundle");
export const GYMS = gymsData as Gym[];
