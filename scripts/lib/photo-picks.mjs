/**
 * Hand-picked Wikimedia Commons photos (scripts/data/photo-picks.json) for
 * places the automated Wikidata matching misses. Each entry lists Commons
 * file titles confirmed to show that place; they are resolved for thumbnail
 * and credit like any other Commons photo, so the same licence, format and
 * size rules apply, and a pick takes precedence over automated matches.
 *
 * Shape: { [layer]: { [placeId]: { name, files: ["File:…jpg"], note? } } }
 * where layer is a bundle key from scripts/apply-photo-picks.mjs.
 */
import { readFile } from "node:fs/promises";
import { pickPhotos, resolvePhotoInfo } from "./commons-photos.mjs";

const PICKS_URL = new URL("../data/photo-picks.json", import.meta.url);

export async function loadPhotoPicks() {
  try {
    return JSON.parse(await readFile(PICKS_URL, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

/**
 * `places` with their layer's picks applied (newest first, up to
 * MAX_PHOTOS_PER_PLACE); places without picks, or whose picks no longer
 * resolve, keep their photos. `photoOptions` is passed to resolvePhotoInfo.
 * Returns `{ places, applied, unresolved }` (`unresolved`: file titles that
 * are gone, non-free, or too small).
 */
export async function applyPhotoPicks(layer, places, photoOptions) {
  const picks = (await loadPhotoPicks())[layer] ?? {};
  const filesFor = (place) => picks[place.id]?.files ?? [];
  const titles = places.flatMap(filesFor);
  if (!titles.length) return { places, applied: 0, unresolved: [] };
  const info = await resolvePhotoInfo(titles, photoOptions);
  let applied = 0;
  const picked = places.map((place) => {
    const photos = pickPhotos(filesFor(place), info);
    if (!photos.length) return place;
    applied += 1;
    return { ...place, photos };
  });
  return { places: picked, applied, unresolved: [...new Set(titles)].filter((title) => !info.has(title)) };
}
