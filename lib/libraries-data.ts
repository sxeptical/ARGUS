import librariesData from "@/public/libraries.json";
import { isPhotoList } from "@/lib/amenities-data";
import type { PublicLibrary } from "@/types";

const LIBRARY_SOURCES: ReadonlySet<string> = new Set(["nlb", "osm"]);

const isNullableString = (value: unknown) =>
  value === null || typeof value === "string";

const isPublicLibrary = (value: unknown): value is PublicLibrary => {
  const library = value as Partial<PublicLibrary> | null;
  return (
    typeof library?.id === "string" &&
    library.id.length > 0 &&
    typeof library.name === "string" &&
    library.name.length > 0 &&
    isNullableString(library.branch) &&
    isNullableString(library.address) &&
    Number.isFinite(library.lat) &&
    Number.isFinite(library.lng) &&
    isPhotoList(library.photos) &&
    typeof library.source === "string" &&
    LIBRARY_SOURCES.has(library.source)
  );
};

export function validateLibrariesBundle(value: unknown): value is PublicLibrary[] {
  return Array.isArray(value) && value.every(isPublicLibrary);
}

// Built by scripts/fetch-libraries.mjs; see that script for sources/licences.
if (!validateLibrariesBundle(librariesData))
  throw new Error("Invalid libraries bundle");
const LIBRARIES = librariesData as PublicLibrary[];
export { LIBRARIES };
