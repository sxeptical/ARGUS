import heritageData from "@/public/heritage.json";
import {
  isAddressedPlace,
  isNullableHttpUrl,
  isNullableString,
  isOneOf,
  isPhotoList,
} from "@/lib/bundle-validation";
import { HERITAGE_KINDS, type HeritageSite } from "@/types";

const isHeritageSite = (value: unknown): value is HeritageSite => {
  const site = value as Partial<HeritageSite>;
  return (
    isAddressedPlace(value) &&
    isOneOf(HERITAGE_KINDS, site.kind) &&
    isNullableString(site.description) &&
    isNullableHttpUrl(site.website) &&
    isPhotoList(site.photos) &&
    isOneOf(["nhb", "osm"], site.source)
  );
};

export function validateHeritageBundle(value: unknown): value is HeritageSite[] {
  return Array.isArray(value) && value.every(isHeritageSite);
}

// Built by scripts/fetch-heritage.mjs; see that script for sources/licences.
if (!validateHeritageBundle(heritageData))
  throw new Error("Invalid heritage bundle");
export const HERITAGE_SITES = heritageData as HeritageSite[];
