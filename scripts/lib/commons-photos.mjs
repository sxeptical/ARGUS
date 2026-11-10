/**
 * Shared Wikidata / Wikimedia Commons plumbing for the authoring-time data
 * scripts: paced API calls, photo-file filtering, and thumbnails + the credit
 * each freely licensed file requires.
 */

// Wikimedia's API policy wants an identifiable agent with a contact URL.
export const USER_AGENT = "argus-osint/0.1 (https://github.com/sxeptical/ARGUS; authoring-time data fetch)";
const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";
const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
export const MAX_PHOTOS_PER_PLACE = 3;
const PHOTO_THUMB_WIDTH = 480;
const MIN_PHOTO_EDGE = 800;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Overpass and the Wikimedia APIs shed load with 429/5xx; retry those a few times.
export const fetchJson = async (url, init, attempts = 4) => {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
    if (response.ok) return response.json();
    if (attempt >= attempts || ![429, 502, 503, 504].includes(response.status)) {
      throw new Error(`${response.status} ${response.statusText}: ${url.slice(0, 160)}`);
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : attempt * 5_000);
  }
};

// Commons calls run one at a time with a short pause, per Wikimedia's etiquette.
export const commonsQuery = async (params) => {
  await sleep(500);
  return fetchJson(`${COMMONS_API_URL}?${new URLSearchParams({ format: "json", formatversion: "2", maxlag: "5", ...params })}`, {
    headers: { "User-Agent": USER_AGENT },
  }, 6);
};
const stripHtml = (html) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
// Commons "Artist" is free-form: drop "User:" prefixes and unwrap the
// "No machine-readable author provided. X assumed (...)" placeholder.
const cleanAuthor = (artist) =>
  (/No machine-readable author provided\. (.+?) assumed/i.exec(artist)?.[1] ?? artist).replace(/^User:/i, "").replace(/\s+\.$/, "").trim() || "Unknown author";
const truncate = (value, max) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);
// Thumbnails come from thumb.wikimedia.org (small originals from upload.).
const WIKIMEDIA_MEDIA_URL_RE = /^https:\/\/(?:upload|thumb)\.wikimedia\.org\//;
const withoutTracking = (url) => {
  const parsed = new URL(url);
  for (const key of [...parsed.searchParams.keys()]) if (key.startsWith("utm_")) parsed.searchParams.delete(key);
  return parsed.toString();
};
// Commons also holds logos, floor plans, maps and signage, and (newest first
// surfaces these) photos of the bus stop, rail line or lockers next door;
// keep photos of the place itself.
const NOT_THE_PLACE_RE =
  /\b(?:logo|maps?|plans?|directory|floor|signs?|signboard|info board|notice ?board|machines?|mesin|bus ?stops?|bus interchange|(?:mrt|lrt) (?:tracks?|stations?|viaducts?)|tracks?|lockers?|kiosks?|car ?parks?|toilets?)\b/i;
export const isPhotoFile = (title) => /\.jpe?g$/i.test(title) && !NOT_THE_PLACE_RE.test(title);

/** Wikidata items of one class in Singapore, with coordinates, image, and Commons category. */
export async function fetchWikidataItems(classId) {
  const query = `SELECT ?item ?itemLabel ?coord ?image ?commonscat WHERE {
    ?item wdt:P31/wdt:P279* wd:${classId}; wdt:P17 wd:Q334.
    OPTIONAL { ?item wdt:P625 ?coord } OPTIONAL { ?item wdt:P18 ?image } OPTIONAL { ?item wdt:P373 ?commonscat }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }`;
  const data = await fetchJson(`${WIKIDATA_SPARQL_URL}?${new URLSearchParams({ query })}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
  });
  const items = new Map();
  for (const row of data?.results?.bindings ?? []) {
    const id = row.item.value.split("/").pop();
    const item = items.get(id) ?? { id, label: row.itemLabel?.value ?? "", lat: null, lng: null, images: new Set(), category: null };
    const point = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(row.coord?.value ?? "");
    if (point) [item.lng, item.lat] = [Number(point[1]), Number(point[2])];
    if (row.image) item.images.add(`File:${decodeURIComponent(row.image.value.split("/").pop()).replace(/_/g, " ")}`);
    if (row.commonscat) item.category = row.commonscat.value;
    items.set(id, item);
  }
  return items;
}

const GENERIC_PLACE_WORDS = new Set(["hawker", "food", "market", "centre", "center", "cooked", "village", "complex", "road", "street", "avenue", "block", "singapore", "mall", "shopping", "plaza", "point", "city", "the", "park", "parks", "nature", "reserve", "garden", "gardens"]);
const distinctiveWords = (label) =>
  label.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !GENERIC_PLACE_WORDS.has(word));

const MAX_SUBCATEGORIES = 8;
const MAX_CANDIDATES_PER_PLACE = 150;

/**
 * Candidate file titles for a Wikidata item: its main image plus the photos
 * in its Commons category and one level of subcategories ("Interior of X",
 * "X in 2024"), so pickPhotos can choose the newest rather than the first.
 */
async function itemPhotoTitles(item) {
  const titles = [...item.images];
  if (item.category) {
    const subcats = await commonsQuery({ action: "query", list: "categorymembers", cmtitle: `Category:${item.category}`, cmtype: "subcat", cmlimit: "50" });
    const categories = [
      `Category:${item.category}`,
      ...(subcats?.query?.categorymembers ?? []).map((member) => member.title).slice(0, MAX_SUBCATEGORIES),
    ];
    // Categories collect loosely related files (machines, signage, nearby
    // streets): keep only files whose name mentions the place.
    const words = distinctiveWords(item.label);
    for (const category of categories) {
      const members = await commonsQuery({ action: "query", list: "categorymembers", cmtitle: category, cmtype: "file", cmlimit: "200" });
      titles.push(...(members?.query?.categorymembers ?? [])
        .map((member) => member.title)
        .filter((title) => words.some((word) => title.toLowerCase().includes(word))));
    }
  }
  return [...new Set(titles)].filter(isPhotoFile).slice(0, MAX_CANDIDATES_PER_PLACE);
}

/**
 * Capture year from Commons' DateTimeOriginal ("2024-05-12 14:03", "12 May
 * 2024", "<time datetime=...>"), or null when missing or implausible.
 */
export const photoYear = (raw, now = new Date()) => {
  const match = /\b(19[89]\d|20\d\d)\b/.exec(stripHtml(raw));
  const year = match ? Number(match[1]) : null;
  return year !== null && year <= now.getFullYear() ? year : null;
};

/** Thumbnail + attribution for each usable file title, in batches of 50. */
export async function resolvePhotoInfo(titles) {
  const allTitles = [...new Set(titles)];
  const infoByTitle = new Map();
  for (let i = 0; i < allTitles.length; i += 50) {
    const batch = await commonsQuery({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      iiextmetadatafilter: "LicenseShortName|Artist|DateTimeOriginal",
      iiurlwidth: String(PHOTO_THUMB_WIDTH),
      titles: allTitles.slice(i, i + 50).join("|"),
    });
    for (const page of batch?.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      const meta = info?.extmetadata ?? {};
      const license = stripHtml(meta.LicenseShortName?.value);
      const author = truncate(cleanAuthor(stripHtml(meta.Artist?.value)), 40);
      // Only freely licensed JPEGs served from Wikimedia's media hosts, big
      // enough to fill the gallery without upscaling.
      if (info?.mime !== "image/jpeg" || !license || /fair use|non-free/i.test(license)) continue;
      if (!WIKIMEDIA_MEDIA_URL_RE.test(info.thumburl ?? "")) continue;
      if (Math.max(info.width ?? 0, info.height ?? 0) < MIN_PHOTO_EDGE) continue;
      infoByTitle.set(page.title, {
        thumb: withoutTracking(info.thumburl),
        page: info.descriptionurl,
        author,
        license,
        source: "commons",
        year: photoYear(meta.DateTimeOriginal?.value),
      });
    }
  }
  return infoByTitle;
}

// Photos taken within this many years count as recent.
const RECENT_YEARS = 6;

/**
 * Up to MAX_PHOTOS_PER_PLACE of the resolved titles, newest capture year
 * first (undated last; ties keep the given order, so a Wikidata main image
 * wins among equals). Among recent photos, one per author comes first so a
 * single visit doesn't fill the gallery; a second recent shot still beats
 * an older photo from someone else.
 */
export const pickPhotos = (titles, infoByTitle, now = new Date()) => {
  const ranked = titles
    .flatMap((title, index) => (infoByTitle.has(title) ? [{ photo: infoByTitle.get(title), index }] : []))
    .sort((a, b) => (b.photo.year ?? 0) - (a.photo.year ?? 0) || a.index - b.index)
    .map(({ photo }) => photo);
  const recent = ranked.filter((photo) => (photo.year ?? 0) >= now.getFullYear() - RECENT_YEARS);
  const authors = new Set();
  const spread = recent.filter((photo) => !authors.has(photo.author) && Boolean(authors.add(photo.author)));
  return [...new Set([...spread, ...recent, ...ranked])].slice(0, MAX_PHOTOS_PER_PLACE);
};

/**
 * Up to MAX_PHOTOS_PER_PLACE Commons photos per place, keyed by place id.
 * `itemFor` picks the place's Wikidata item (or undefined).
 */
export async function fetchCommonsPhotos(places, itemFor) {
  const candidates = new Map();
  for (const place of places) {
    const item = itemFor(place);
    if (!item) continue;
    const titles = await itemPhotoTitles(item);
    if (titles.length) candidates.set(place.id, titles);
  }
  const infoByTitle = await resolvePhotoInfo([...candidates.values()].flat());
  return new Map([...candidates].map(([id, titles]) => [id, pickPhotos(titles, infoByTitle)]));
}
