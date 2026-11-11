/**
 * Photo pipeline for static amenity layers whose dataset carries no photo
 * URLs (community clubs, hotels, future layers): bridge each place to a
 * Wikidata item — via an OSM `wikidata` tag, or by label search — then
 * resolve up to MAX_PHOTOS_PER_PLACE freely licensed Wikimedia Commons
 * photos with per-file attribution, reusing scripts/lib/commons-photos.mjs.
 *
 * Matching is deliberately conservative: the item's label must match the
 * place's name (on distinctive words, so "CC" vs "Community Club" and
 * "Centre" vs "Center" don't matter) AND its coordinates must sit within
 * `radiusM` of the place. Anything less certain yields no photos rather
 * than wrong ones. Only Commons media ever reaches the bundle; never scrape
 * PA, hotel, Google, or other copyrighted sources.
 */
import { fetchCommonsPhotos, fetchJson, USER_AGENT } from "./commons-photos.mjs";

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const normalizeName = (name) =>
  String(name ?? "").toLowerCase().replace(/&/g, "and").replace(/\bsingapore\b/g, "").replace(/[^a-z0-9]/g, "");
// "Sengkang CC" / "Sengkang Community Club" → "sengkang": the generic
// venue words carry no identity, so they don't block a name match.
const GENERIC_WORDS = new Set(["cc", "community", "centre", "center", "club", "hall", "hub"]);
/** Place name without generic venue words, e.g. "Sengkang" from "Sengkang CC". */
export const distinctiveTerm = (name) =>
  String(name ?? "").trim().split(/\s+/).filter((word) => !GENERIC_WORDS.has(word.toLowerCase())).join(" ");
// "Sengkang CC" / "Sengkang Community Club" → "sengkang": the generic
// venue words carry no identity, so they don't block a name match.
export const distinctiveKey = (name) =>
  normalizeName(String(name ?? "").replace(/\b(?:cc|community|centre|center|club|hall|hub)\b/gi, " "));

// Equirectangular metres; accurate to well under 1% for sub-km matching.
const distMetres = (a, b) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat * 6371000, dLng * 6371000);
};

const elementPoint = (element) => {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

/**
 * Wikidata items (shape compatible with fetchWikidataItems) for explicit
 * entity ids: label, coordinates, main image, and Commons category.
 */
export async function fetchWikidataItemsByIds(ids) {
  const items = new Map();
  const unique = [...new Set(ids)].filter((id) => /^Q\d+$/.test(id));
  for (let i = 0; i < unique.length; i += 50) {
    const data = await fetchJson(
      `${WIKIDATA_API_URL}?${new URLSearchParams({
        action: "wbgetentities",
        ids: unique.slice(i, i + 50).join("|"),
        props: "labels|claims",
        property: "P18|P625|P373",
        languages: "en",
        format: "json",
      })}`,
      { headers: { "User-Agent": USER_AGENT } },
    );
    for (const [id, entity] of Object.entries(data?.entities ?? {})) {
      if (!entity || entity.missing) continue;
      const claims = entity.claims ?? {};
      const valueOf = (property) => claims[property]?.[0]?.mainsnak?.datavalue?.value;
      const point = valueOf("P625");
      const image = valueOf("P18");
      const category = valueOf("P373");
      items.set(id, {
        id,
        label: entity.labels?.en?.value ?? "",
        lat: typeof point?.latitude === "number" ? point.latitude : null,
        lng: typeof point?.longitude === "number" ? point.longitude : null,
        images: typeof image === "string" && image ? new Set([`File:${image.replace(/_/g, " ")}`]) : new Set(),
        category: typeof category === "string" ? category.replace(/^Category:/, "") : null,
      });
    }
  }
  return items;
}

const searchItemIds = async (term) => {
  if (!term.trim()) return [];
  const data = await fetchJson(
    `${WIKIDATA_API_URL}?${new URLSearchParams({
      action: "wbsearchentities",
      search: term,
      language: "en",
      type: "item",
      limit: "20",
      format: "json",
    })}`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  return (data?.search ?? []).map((hit) => hit.id).filter(Boolean);
};

/**
 * Credited Commons photos for each place, keyed by place id. `overpassQuery`
 * should select OSM elements carrying a `wikidata` tag (the bridge);
 * `searchNames(place)` yields label-search terms for places the bridge
 * misses. Returns `{ photos, matched, searched }` where `matched` counts
 * places given a Wikidata item and `searched` counts label searches run.
 */
export async function fetchPlacePhotos(
  places,
  { overpassQuery, radiusM = 300, searchNames, wikidataSearch = true },
) {
  const stats = { matched: 0, searched: 0 };

  // 1) OSM bridge: an element with a wikidata tag, same distinctive name,
  //    within radiusM of the place.
  const bridge = overpassQuery
    ? await fetchJson(OVERPASS_URL, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: overpassQuery }),
      })
    : null;
  const tagged = (bridge?.elements ?? []).filter((element) => {
    const qid = element.tags?.wikidata;
    return /^Q\d+$/.test(qid ?? "") && elementPoint(element);
  });

  const itemByPlace = new Map();
  const needsSearch = [];
  for (const place of places) {
    const key = distinctiveKey(place.name);
    const candidates = tagged
      .filter((element) => key && distinctiveKey(element.tags.name) === key)
      .map((element) => ({ element, distance: distMetres(place, elementPoint(element)) }))
      .filter(({ distance }) => distance <= radiusM)
      .sort((a, b) => a.distance - b.distance);
    if (candidates.length) itemByPlace.set(place.id, candidates[0].element.tags.wikidata);
    else if (wikidataSearch) needsSearch.push(place);
  }

  // 2) Wikidata label search for the rest, still requiring label match and
  //    coordinate proximity before a hit is accepted.
  if (wikidataSearch && needsSearch.length) {
    const wanted = new Map();
    for (const place of needsSearch) {
      const terms = [...new Set([
        ...(searchNames ? searchNames(place) : [place.name]),
        distinctiveTerm(place.name),
      ])];
      for (const term of terms) {
        stats.searched += 1;
        for (const id of await searchItemIds(term)) {
          if (!wanted.has(id)) wanted.set(id, []);
          wanted.get(id).push(place);
        }
        await sleep(300);
      }
    }
    const items = await fetchWikidataItemsByIds([...wanted.keys()]);
    for (const place of needsSearch) {
      const key = distinctiveKey(place.name);
      const hit = [...wanted.keys()]
        .map((id) => items.get(id))
        .filter(
          (item) =>
            item && item.lat !== null && key && distinctiveKey(item.label) === key &&
            distMetres(place, item) <= radiusM,
        )
        .sort((a, b) => distMetres(place, a) - distMetres(place, b))[0];
      if (hit) itemByPlace.set(place.id, hit.id);
    }
  }

  const items = await fetchWikidataItemsByIds([...new Set(itemByPlace.values())]);
  stats.matched = [...itemByPlace.values()].filter((id) => items.has(id)).length;
  const photos = await fetchCommonsPhotos(places, (place) => items.get(itemByPlace.get(place.id)));
  return { photos, stats };
}
