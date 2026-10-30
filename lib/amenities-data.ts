import amenitiesData from "@/public/amenities.json";
import type { AmenitiesBundle, PlacePhoto } from "@/types";

const isPlace = (value: unknown): value is { id: string; name: string; lat: number; lng: number } => {
  const place = value as { id?: unknown; name?: unknown; lat?: unknown; lng?: unknown } | null;
  return typeof place?.id === "string" && typeof place.name === "string" && place.name.length > 0 && Number.isFinite(place.lat) && Number.isFinite(place.lng);
};

// Photos are hotlinked, so only from the hosts the CSP allows: Wikimedia's
// media hosts (with a licence to credit) or NEA's site.
const WIKIMEDIA_MEDIA_URL_RE = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//;
const NEA_MEDIA_URL_RE = /^https:\/\/www\.nea\.gov\.sg\//;
const isPhoto = (photo: unknown) => {
  const p = photo as Partial<PlacePhoto> | null;
  if (typeof p?.thumb !== "string" || typeof p.author !== "string") return false;
  if (p.source === "commons") return WIKIMEDIA_MEDIA_URL_RE.test(p.thumb) && typeof p.license === "string" && p.license.length > 0;
  return p.source === "nea" && NEA_MEDIA_URL_RE.test(p.thumb);
};
const isPhotoList = (value: unknown) => Array.isArray(value) && value.every(isPhoto);

export function validateAmenitiesBundle(value: unknown): value is AmenitiesBundle {
  if (!value || typeof value !== "object") return false;
  const data = value as Partial<AmenitiesBundle>;
  return Array.isArray(data.hawkers) && Array.isArray(data.malls) &&
    data.hawkers.every((hawker) => isPlace(hawker) && (hawker.status === "open" || hawker.status === "planned") && isPhotoList(hawker.photos)) &&
    data.malls.every((mall) => isPlace(mall) && isPhotoList(mall.photos));
}

// Built by scripts/fetch-amenities.mjs; see that script for sources/licences.
if (!validateAmenitiesBundle(amenitiesData)) throw new Error("Invalid amenities bundle");
const AMENITIES = amenitiesData as AmenitiesBundle;
export const HAWKER_CENTRES = AMENITIES.hawkers;
export const MALLS = AMENITIES.malls;
