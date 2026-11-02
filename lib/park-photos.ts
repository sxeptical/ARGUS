import parkPhotosData from "@/public/park-photos.json";
import { isPhotoList } from "@/lib/amenities-data";
import type { PlacePhoto } from "@/types";

export function validateParkPhotos(value: unknown): value is Record<string, PlacePhoto[]> {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.values(value).every(isPhotoList);
}

// Built by scripts/fetch-park-photos.mjs, keyed by display park name.
if (!validateParkPhotos(parkPhotosData)) throw new Error("Invalid park photo bundle");
export const PARK_PHOTOS: ReadonlyMap<string, PlacePhoto[]> = new Map(Object.entries(parkPhotosData as Record<string, PlacePhoto[]>));

const NO_PHOTOS: PlacePhoto[] = [];
export const photosForPark = (name: string): PlacePhoto[] => PARK_PHOTOS.get(name) ?? NO_PHOTOS;
