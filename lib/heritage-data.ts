import heritageData from "@/public/heritage.json";
import { isPhotoList } from "@/lib/amenities-data";
import type { HeritageKind, HeritageSite, HeritageSource } from "@/types";

const HERITAGE_SOURCES: ReadonlySet<string> = new Set(["nhb", "osm"]);

/** Every heritage kind the bundle can carry, in display order. */
export const HERITAGE_KIND_VALUES: readonly HeritageKind[] = [
  "historic-site",
  "monument",
  "museum",
];
const HERITAGE_KIND_SET: ReadonlySet<string> = new Set(HERITAGE_KIND_VALUES);

/** Kind filter defaults: every kind on. */
export const DEFAULT_HERITAGE_KIND_VISIBILITY: Record<HeritageKind, boolean> =
  Object.fromEntries(HERITAGE_KIND_VALUES.map((kind) => [kind, true])) as Record<HeritageKind, boolean>;

const isNullableString = (value: unknown) =>
  value === null || typeof value === "string";

const isHeritageSite = (value: unknown): value is HeritageSite => {
  const site = value as Partial<HeritageSite> | null;
  return (
    typeof site?.id === "string" &&
    site.id.length > 0 &&
    typeof site.name === "string" &&
    site.name.length > 0 &&
    typeof site.kind === "string" &&
    HERITAGE_KIND_SET.has(site.kind) &&
    isNullableString(site.address) &&
    isNullableString(site.description) &&
    isNullableString(site.website) &&
    Number.isFinite(site.lat) &&
    Number.isFinite(site.lng) &&
    isPhotoList(site.photos) &&
    typeof site.source === "string" &&
    HERITAGE_SOURCES.has(site.source)
  );
};

export function validateHeritageBundle(value: unknown): value is HeritageSite[] {
  return Array.isArray(value) && value.every(isHeritageSite);
}

// Built by scripts/fetch-heritage.mjs; see that script for sources/licences.
if (!validateHeritageBundle(heritageData))
  throw new Error("Invalid heritage bundle");
const HERITAGE_SITES = heritageData as HeritageSite[];
export { HERITAGE_SITES };
export type { HeritageKind, HeritageSource };
