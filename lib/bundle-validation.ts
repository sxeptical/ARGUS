/**
 * Shared checks for the static JSON bundles in public/. Each bundle is
 * validated once at import, so a bad regeneration fails the build and the
 * tests rather than rendering broken markers.
 */
import type { PlacePhoto } from "@/types";

export const isNullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

/** `null` or a valid non-negative whole number (counts, years). */
export const isNullableNonNegativeInteger = (
  value: unknown,
): value is number | null =>
  value === null || (typeof value === "number" && Number.isInteger(value) && value >= 0);

/** `null` or an http(s) URL, for fields rendered as a link. */
export const isNullableHttpUrl = (value: unknown): value is string | null =>
  value === null || (typeof value === "string" && /^https?:\/\//i.test(value));

/** The fields every map place shares: a non-empty id and name, and a position. */
export const isPlace = (
  value: unknown,
): value is { id: string; name: string; lat: number; lng: number } => {
  const place = value as { id?: unknown; name?: unknown; lat?: unknown; lng?: unknown } | null;
  return (
    typeof place?.id === "string" &&
    place.id.length > 0 &&
    typeof place.name === "string" &&
    place.name.length > 0 &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng)
  );
};

/** `isPlace` plus the nullable street address most bundles carry. */
export const isAddressedPlace = (value: unknown) =>
  isPlace(value) && isNullableString((value as { address?: unknown }).address);

export const isOneOf = (options: ReadonlyArray<string>, value: unknown) =>
  typeof value === "string" && options.includes(value);

// Photos are hotlinked, so only from the hosts the CSP allows: Wikimedia's
// media hosts (with a licence to credit) or NEA's site.
const WIKIMEDIA_MEDIA_URL_RE = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//;
const NEA_MEDIA_URL_RE = /^https:\/\/www\.nea\.gov\.sg\//;
const COMMONS_PAGE_URL_RE = /^https:\/\/commons\.wikimedia\.org\//;
// `page` is rendered as an href, so never let script or plain-text URLs in.
const isPhotoPage = (page: unknown): page is string | null =>
  page === null || (typeof page === "string" && /^https:\/\//i.test(page));
const isPhoto = (photo: unknown) => {
  const p = photo as Partial<PlacePhoto> | null;
  if (typeof p?.thumb !== "string" || typeof p.author !== "string")
    return false;
  if (p.year !== undefined && p.year !== null && !Number.isInteger(p.year))
    return false;
  if (!isPhotoPage(p.page)) return false;
  if (p.source === "commons")
    return (
      WIKIMEDIA_MEDIA_URL_RE.test(p.thumb) &&
      typeof p.license === "string" &&
      p.license.length > 0 &&
      (p.page === null || COMMONS_PAGE_URL_RE.test(p.page))
    );
  return p.source === "nea" && NEA_MEDIA_URL_RE.test(p.thumb);
};
export const isPhotoList = (value: unknown) =>
  Array.isArray(value) && value.every(isPhoto);
