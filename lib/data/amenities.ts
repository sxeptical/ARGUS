import amenitiesData from "@/public/amenities.json";
import { HAWKER_CLOSURES } from "@/lib/data/hawker-closures";
import {
  isAddressedPlace,
  isNullableNonNegativeInteger,
  isNullableString,
  isPhotoList,
} from "@/lib/bundle-validation";
import type { AmenitiesBundle, HawkerCentre, Mall } from "@/types";

const isMall = (value: unknown): value is Mall => {
  const mall = value as Partial<Mall>;
  return (
    isAddressedPlace(value) &&
    isNullableString(mall.openingHours) &&
    isNullableNonNegativeInteger(mall.stores) &&
    isNullableNonNegativeInteger(mall.fnb) &&
    isNullableString(mall.nearestMrt) &&
    isPhotoList(mall.photos)
  );
};

const isHawkerCentre = (value: unknown): value is HawkerCentre => {
  const hawker = value as Partial<HawkerCentre>;
  return (
    isAddressedPlace(value) &&
    isNullableNonNegativeInteger(hawker.stalls) &&
    (hawker.status === "open" || hawker.status === "planned") &&
    isNullableNonNegativeInteger(hawker.expectedYear) &&
    isPhotoList(hawker.photos)
  );
};

export function validateAmenitiesBundle(
  value: unknown,
): value is AmenitiesBundle {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AmenitiesBundle>;
  return (
    Array.isArray(data.hawkers) &&
    Array.isArray(data.malls) &&
    data.hawkers.every(isHawkerCentre) &&
    data.malls.every(isMall)
  );
}

// Built by scripts/fetch-amenities.mjs; see that script for sources/licences.
if (!validateAmenitiesBundle(amenitiesData))
  throw new Error("Invalid amenities bundle");
const AMENITIES = amenitiesData as AmenitiesBundle;
export const MALLS = AMENITIES.malls;

// Closures live in their own bundle (scripts/fetch-hawker-closures.mjs) so
// they can be refreshed without regenerating malls/photos; join by hawker id.
export const HAWKER_CENTRES = AMENITIES.hawkers.map((hawker) => ({
  ...hawker,
  closures: HAWKER_CLOSURES.get(hawker.id) ?? [],
}));
for (const id of HAWKER_CLOSURES.keys()) {
  if (!AMENITIES.hawkers.some((hawker) => hawker.id === id))
    throw new Error(`Hawker closures reference unknown hawker centre ${id}`);
}
