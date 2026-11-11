import librariesData from "@/public/libraries.json";
import { isAddressedPlace, isNullableString, isOneOf, isPhotoList } from "@/lib/bundle-validation";
import type { PublicLibrary } from "@/types";

const isPublicLibrary = (value: unknown): value is PublicLibrary => {
  const library = value as Partial<PublicLibrary>;
  return (
    isAddressedPlace(value) &&
    isNullableString(library.branch) &&
    isPhotoList(library.photos) &&
    isOneOf(["nlb", "osm"], library.source)
  );
};

export function validateLibrariesBundle(value: unknown): value is PublicLibrary[] {
  return Array.isArray(value) && value.every(isPublicLibrary);
}

// Built by scripts/fetch-libraries.mjs; see that script for sources/licences.
if (!validateLibrariesBundle(librariesData))
  throw new Error("Invalid libraries bundle");
export const LIBRARIES = librariesData as PublicLibrary[];
