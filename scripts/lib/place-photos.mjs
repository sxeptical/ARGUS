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
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
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

// Heritage records name one building many ways: "Former X (now Y)",
// "X Mosque" / "Masjid X", "St." / "Saint", "Gafoor" / "Gaffoor". These
// words carry no identity on their own, so overlap ignores them.
const LOOSE_GENERIC_WORDS = new Set([
  "and", "the", "of", "at", "now", "known", "as", "former", "old", "singapore", "building", "buildings",
  "house", "hall", "block", "centre", "center", "park", "hotel", "school", "museum", "church", "cathedral",
  "temple", "mosque", "masjid", "saint", "saints", "sri", "fort",
]);
const looseTokens = (name) => [
  ...new Set(
    String(name ?? "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’]s\b/g, "")
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 3 && !LOOSE_GENERIC_WORDS.has(word)),
  ),
];
/**
 * A name plus the buildings it bundles: "Former Parliament House and Annex
 * Building (now The Arts House)" also yields "Parliament House", "Annex
 * Building" and "The Arts House"; "Singapore River Bridges: Cavenagh
 * Bridge, Anderson Bridge and Elgin Bridge" yields each bridge.
 */
export const nameVariants = (name) => {
  const full = String(name ?? "");
  const inner = [...full.matchAll(/\(([^)]*)\)/g)].map((match) => match[1].replace(/^\s*now(?:\s+known\s+as)?\s+/i, ""));
  const base = full.replace(/\([^)]*\)/g, " ");
  const pieces = [base, ...inner].flatMap((part) => part.split(/\s*[:,&]\s*|\s+-\s+|\s+and\s+/i));
  return [...new Set([full, base, ...inner, ...pieces].map((variant) => variant.replace(/\s+/g, " ").trim()).filter(Boolean))];
};
// One edit apart (insert, delete or substitute), for transliterations.
const withinOneEdit = (a, b) => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
};
const tokensMatch = (a, b) => a === b || (Math.min(a.length, b.length) >= 5 && withinOneEdit(a, b));
const tokenOverlap = (a, b) => {
  const [shorter, longer] = [looseTokens(a), looseTokens(b)].sort((x, y) => x.length - y.length);
  if (!shorter.length) return 0;
  return shorter.filter((word) => longer.some((other) => tokensMatch(word, other))).length / longer.length;
};
/**
 * Best share (0..1) of distinctive words two names have in common, over
 * their variants and measured against the longer name, so a bare "Raffles"
 * can't claim "Raffles Hotel" for "Raffles Institution". "Abdul Gafoor
 * Mosque" vs "Masjid Abdul Gaffoor" scores 1; "Former Keng Teck Whay
 * Building" vs "Thian Hock Keng" scores 1/3.
 */
export const nameOverlap = (a, b) =>
  Math.max(0, ...nameVariants(a).flatMap((x) => nameVariants(b).map((y) => tokenOverlap(x, y))));
/** Loose name match: most of the longer name's distinctive words agree. */
export const namesMatch = (a, b) => nameOverlap(a, b) > 0.5;
// A rail station shares its neighbourhood's name ("Raffles Place MRT
// station") but is never the heritage site.
const RAIL_STATION_RE = /\b(?:mrt|lrt)\b/i;

const itemNames = (item) => [item.label, ...(item.aliases ?? [])].filter(Boolean);

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
        props: "labels|aliases|claims",
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
        aliases: (entity.aliases?.en ?? []).map((alias) => alias.value).filter(Boolean),
        lat: typeof point?.latitude === "number" ? point.latitude : null,
        lng: typeof point?.longitude === "number" ? point.longitude : null,
        images: typeof image === "string" && image ? new Set([`File:${image.replace(/_/g, " ")}`]) : new Set(),
        category: typeof category === "string" ? category.replace(/^Category:/, "") : null,
      });
    }
  }
  return items;
}

/**
 * Singapore Wikidata items carrying a heritage designation (P1435), e.g.
 * Q3862742 "National monuments of Singapore": id, label, English aliases
 * and coordinates. A small, curated pool that is safe to match loosely.
 */
export async function fetchDesignatedItems(designationId) {
  const query = `SELECT ?item ?itemLabel ?coord (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
    ?item wdt:P1435 wd:${designationId}; wdt:P17 wd:Q334; wdt:P625 ?coord.
    OPTIONAL { ?item skos:altLabel ?alias FILTER(LANG(?alias) = "en") }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } GROUP BY ?item ?itemLabel ?coord`;
  const data = await fetchJson(`${WIKIDATA_SPARQL_URL}?${new URLSearchParams({ query })}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
  });
  const items = [];
  for (const row of data?.results?.bindings ?? []) {
    const point = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord?.value ?? "");
    if (!point) continue;
    items.push({
      id: row.item.value.split("/").pop(),
      label: row.itemLabel?.value ?? "",
      aliases: (row.aliases?.value ?? "").split("|").filter(Boolean),
      lat: Number(point[2]),
      lng: Number(point[1]),
    });
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
 * `itemPool` is an optional curated list of Wikidata items (see
 * fetchDesignatedItems) tried next; `searchNames(place)` yields label-search
 * terms for places still unmatched. Names must match exactly on distinctive
 * words, or with `looseNames` via namesMatch (rail stations excluded) — for
 * heritage records whose names drift from Wikidata's. `exclusiveGroup(place)`
 * lets one item serve only one place per group. `photoOptions` is
 * passed to resolvePhotoInfo. Returns `{ photos, stats, matches }`: `stats`
 * counts places given a Wikidata item (`matched`, of which `pooled` via the
 * pool) and label searches run (`searched`); `matches` maps place id to
 * the chosen item's label, for reviewing loose matches.
 */
export async function fetchPlacePhotos(
  places,
  {
    overpassQuery,
    itemPool = [],
    radiusM = 300,
    searchNames,
    wikidataSearch = true,
    looseNames = false,
    exclusiveGroup,
    photoOptions,
  },
) {
  const stats = { matched: 0, pooled: 0, searched: 0 };
  // Best name score of `names` against the place (0 when none matches).
  const nameScore = (place, names) => {
    if (!looseNames) {
      const key = distinctiveKey(place.name);
      return key && names.some((name) => distinctiveKey(name) === key) ? 1 : 0;
    }
    if (names.some((name) => RAIL_STATION_RE.test(name))) return 0;
    const best = Math.max(0, ...names.map((name) => nameOverlap(place.name, name)));
    return best > 0.5 ? best : 0;
  };
  // Closest best-named candidate within radiusM as { candidate, score,
  // distance }, or undefined.
  const bestCandidate = (place, candidates, namesOf, pointOf) =>
    candidates
      .map((candidate) => ({ candidate, score: nameScore(place, namesOf(candidate)), distance: distMetres(place, pointOf(candidate)) }))
      .filter(({ score, distance }) => score > 0 && distance <= radiusM)
      .sort((a, b) => b.score - a.score || a.distance - b.distance)[0];

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

  // place id → { id, score, distance, pooled }
  const chosen = new Map();
  const needsSearch = [];
  for (const place of places) {
    const element = bestCandidate(
      place,
      tagged,
      (candidate) => [candidate.tags.name].filter(Boolean),
      elementPoint,
    );
    // 2) Curated pool: label or alias match, within radiusM.
    const pooled = element ? undefined : bestCandidate(place, itemPool, itemNames, (item) => item);
    if (element) chosen.set(place.id, { ...element, id: element.candidate.tags.wikidata });
    else if (pooled) chosen.set(place.id, { ...pooled, id: pooled.candidate.id, pooled: true });
    else if (wikidataSearch) needsSearch.push(place);
  }

  // 3) Wikidata label search for the rest, still requiring a label (or
  //    alias) match and coordinate proximity before a hit is accepted.
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
    const located = [...wanted.keys()].map((id) => items.get(id)).filter((item) => item && item.lat !== null);
    for (const place of needsSearch) {
      const hit = bestCandidate(place, located, itemNames, (item) => item);
      if (hit) chosen.set(place.id, { ...hit, id: hit.candidate.id });
    }
  }

  // Within an `exclusiveGroup`, one item belongs to one place: the best
  // named, then nearest ("Former Attorney-General's Chambers (now Parliament
  // House Block C)" loses The Arts House to the old Parliament House).
  // Same-named records (an OSM node and relation) are one place and share.
  if (exclusiveGroup) {
    const owner = new Map();
    for (const place of places) {
      const match = chosen.get(place.id);
      if (!match) continue;
      const key = `${exclusiveGroup(place)}\u0000${match.id}`;
      const rival = owner.get(key);
      if (rival && rival.name === place.name) continue;
      const wins = !rival || match.score > rival.match.score || (match.score === rival.match.score && match.distance < rival.match.distance);
      if (!wins) chosen.delete(place.id);
      else {
        if (rival) chosen.delete(rival.placeId);
        owner.set(key, { placeId: place.id, name: place.name, match });
      }
    }
  }
  const itemByPlace = new Map([...chosen].map(([placeId, match]) => [placeId, match.id]));
  stats.pooled = [...chosen.values()].filter((match) => match.pooled).length;

  const items = await fetchWikidataItemsByIds([...new Set(itemByPlace.values())]);
  stats.matched = [...itemByPlace.values()].filter((id) => items.has(id)).length;
  const photos = await fetchCommonsPhotos(places, (place) => items.get(itemByPlace.get(place.id)), photoOptions);
  const matches = new Map([...itemByPlace].map(([placeId, id]) => [placeId, items.get(id)?.label ?? id]));
  return { photos, stats, matches };
}
