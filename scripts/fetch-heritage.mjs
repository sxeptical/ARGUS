#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static heritage bundle (public/heritage.json) from:
 *  - NHB Historic Sites (data.gov.sg, Singapore Open Data Licence): 100
 *    points, flat properties. DESCRIPTION is a historical blurb, HYPERLINK
 *    a roots.gov.sg article.
 *  - NHB National Monuments (data.gov.sg, Singapore Open Data Licence): 77
 *    points, same schema (OBJECTID instead of OBJECTID_1).
 *  - OpenStreetMap `tourism=museum` (ODbL): named museums only.
 *
 * The NHB datasets' PHOTOURL (roots.sg media) is deliberately NOT used: the
 * media paths 404 today and the roots.gov.sg/rights terms could not be
 * confirmed as permitting Open Data Licence reuse, so no NHB imagery is
 * bundled. Photos come only from Wikimedia Commons via the place-photos
 * helper (OSM `wikidata` bridge, National Monument pool, label search;
 * loose name + <=300 m gate), archival photos included.
 *
 * HYPERLINK is kept as the record's `website` ("More on Roots.sg" in the UI)
 * only when it resolves; NHB id fields differ (OBJECTID_1 vs OBJECTID).
 * Freshness is per-record FMEL_UPD_D; no catalogue date is trusted.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { ARCHIVAL_PHOTO_OPTIONS, fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { applyPhotoPicks } from "./lib/photo-picks.mjs";
import { fetchDesignatedItems, fetchPlacePhotos } from "./lib/place-photos.mjs";
import { inSingapore, round, text, websiteOf } from "./lib/place-fields.mjs";

const NHB_HISTORIC = "d_31e16b12809e66673e90d8b04fdee1b2";
const NHB_MONUMENTS = "d_b29c230ec6b609e29ed42f71ca9a8767";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// "2 Cox Terrace, Battlebox Entrance, Fort Canning Park, Singapore 179622"
const composeAddress = (props) => {
  const street = [text(props.ADDRESSBLOCKHOUSENUMBER), text(props.ADDRESSSTREETNAME)].filter(Boolean).join(" ");
  const base = [street, text(props.ADDRESSBUILDINGNAME)].filter(Boolean).join(", ");
  const postcode = text(props.ADDRESSPOSTALCODE);
  return base ? `${base}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// NHB's GeoJSON already carries U+FFFD where a curly apostrophe was lost
// upstream ("Singapore�s"); every case is a possessive, so restore it.
const repairNhbText = (value) => value?.replace(/(?<=\p{L})�(?=s\b)/gu, "’") ?? null;

// NHB pins that are plainly wrong, corrected from OneMap. Keyed by record
// id and checked against the name, so a renumbered dataset fails loudly
// instead of moving the wrong site.
const NHB_COORD_FIXES = {
  // NHB: 1.267357, 103.893033 (open sea off Marina South). OneMap "BUKIT
  // BROWN CHINESE CEMETERY", matching the record's Lornie Road description.
  "heritage-historic-2250": { name: "Bukit Brown Municipal Cemetery", lat: 1.336766, lng: 103.824874 },
  // NHB: 1.290745, 103.806514 (mainland, ~3.5 km north of Sentosa).
  // OneMap "FORT SILOSO", 098978.
  "heritage-monument-1684": { name: "Fort Siloso", lat: 1.258516, lng: 103.808634 },
};
const applyCoordFix = (site) => {
  const fix = NHB_COORD_FIXES[site.id];
  if (!fix) return site;
  if (fix.name !== site.name) throw new Error(`NHB_COORD_FIXES: ${site.id} is now "${site.name}", not "${fix.name}"`);
  return { ...site, lat: fix.lat, lng: fix.lng };
};

async function fetchNhb(dataset, kind, idKey) {
  const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${dataset}/poll-download`);
  const url = poll?.data?.url;
  if (!url) throw new Error(`No presigned URL returned for ${dataset}`);
  const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
  const features = data?.features ?? [];
  const sites = [];
  const skipped = [];
  for (const feature of features) {
    if (feature.geometry?.type !== "Point") continue;
    const props = feature.properties ?? {};
    const name = text(props.NAME);
    const [lng, lat] = feature.geometry.coordinates ?? [];
    if (!name || props[idKey] == null || !inSingapore(lat, lng)) {
      skipped.push(name ?? "(unnamed)");
      continue;
    }
    sites.push(applyCoordFix({
      id: `heritage-${kind === "monument" ? "monument" : "historic"}-${props[idKey]}`,
      name: repairNhbText(name),
      kind,
      address: repairNhbText(composeAddress(props)),
      description: repairNhbText(text(props.DESCRIPTION)),
      website: websiteOf(props.HYPERLINK),
      lat: round(lat),
      lng: round(lng),
      source: "nhb",
    }));
  }
  return { sites, skipped };
}

// Keep a Roots.sg hyperlink only when it resolves today; dead media-era
// links must never reach the UI.
async function keepResolving(websites) {
  const seen = new Set();
  const resolving = new Map();
  for (const website of websites) {
    if (!website || seen.has(website)) continue;
    seen.add(website);
    let ok = false;
    try {
      const response = await fetch(website, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(20_000),
      });
      ok = response.ok;
    } catch {
      ok = false;
    }
    resolving.set(website, ok);
    if (seen.size % 10 === 0) await sleep(200);
  }
  return resolving;
}

const historic = await fetchNhb(NHB_HISTORIC, "historic-site", "OBJECTID_1");
// data.gov.sg rate-limits the poll endpoint (~1 poll / 11 s).
await sleep(12_000);
const monumentsResult = await fetchNhb(NHB_MONUMENTS, "monument", "OBJECTID");

const resolving = await keepResolving([...historic.sites, ...monumentsResult.sites].map((s) => s.website));
for (const site of [...historic.sites, ...monumentsResult.sites]) {
  if (site.website && resolving.get(site.website) !== true) site.website = null;
}
// OpenStreetMap museums: named, in bounds, not access=private.
const overpass = await fetchJson(OVERPASS_URL, {
  method: "POST",
  headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    data: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["tourism"="museum"](area.a);out center tags;`,
  }),
});
const museums = [];
const osmSkipped = [];
for (const element of overpass.elements ?? []) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  const name = text(element.tags?.name);
  const tags = element.tags ?? {};
  if (!name || tags.access === "private" || !inSingapore(lat, lng)) {
    osmSkipped.push(name ?? "(unnamed)");
    continue;
  }
  const street = [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" ");
  const postcode = text(tags["addr:postcode"]);
  const address = street ? `${street}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
  museums.push({
    id: `osm-${element.type}-${element.id}`,
    name,
    kind: "museum",
    address,
    description: text(tags.description),
    website: websiteOf(tags.website),
    lat: round(lat),
    lng: round(lng),
    source: "osm",
  });
}

const sites = [...historic.sites, ...monumentsResult.sites, ...museums].sort((a, b) =>
  a.name.localeCompare(b.name, "en-SG"),
);
if (sites.length < 240) throw new Error(`Heritage sources returned only ${sites.length} named sites`);

// Photos: Commons only (see header re NHB PHOTOURL). The OSM bridge covers
// museums, historic features and places of worship tagged with a Wikidata
// item; Wikidata's National Monument designation (Q3862742) is a curated
// pool for the NHB monuments; label search catches the rest. NHB names
// drift from Wikidata's ("Abdul Gafoor Mosque" / "Masjid Abdul Gaffoor",
// "Former X (now Y)"), so names match loosely, still within 300 m.
// Archival photos are welcome here (ARCHIVAL_PHOTO_OPTIONS). Hand-picked
// Commons photos (scripts/data/photo-picks.json) then fill the gaps.
const monumentPool = await fetchDesignatedItems("Q3862742");
const { photos, stats, matches } = await fetchPlacePhotos(sites, {
  overpassQuery: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;(
    nwr["tourism"="museum"]["wikidata"](area.a);
    nwr["historic"]["wikidata"](area.a);
    nwr["heritage"]["wikidata"](area.a);
    nwr["amenity"="place_of_worship"]["wikidata"](area.a);
  );out center tags;`,
  itemPool: monumentPool,
  radiusM: 300,
  searchNames: (site) => [site.name],
  looseNames: true,
  // Two monuments never share a building's photos, but a museum may sit in
  // a monument ("Sun Yat Sen Nanyang Museum" in the former villa).
  exclusiveGroup: (site) => site.kind,
  photoOptions: ARCHIVAL_PHOTO_OPTIONS,
});
const { places: withPhotos, applied: pickedCount } = await applyPhotoPicks(
  "heritage",
  sites.map((site) => ({ ...site, photos: photos.get(site.id) ?? [] })),
  ARCHIVAL_PHOTO_OPTIONS,
);
const photoCount = withPhotos.filter((site) => site.photos.length).length;
// Loose matches are worth eyeballing after each rebuild.
for (const site of sites) {
  const label = matches.get(site.id);
  if (label && label !== site.name) console.log(`  ${site.name} → ${label}`);
}

const serialized = JSON.stringify(withPhotos);
await mkdir("public", { recursive: true });
await writeFile("public/heritage.json", serialized);
console.log(
  `Heritage bundle: ${sites.length} sites ` +
    `(${historic.sites.length} historic sites, ${monumentsResult.sites.length} monuments, ${museums.length} museums; ` +
    `${historic.skipped.length + monumentsResult.skipped.length + osmSkipped.length} skipped; photos on ${photoCount} ` +
    `(${stats.matched} matched to a Wikidata item, ${stats.pooled} via the monument pool, ${stats.searched} label searches; ` +
    `${pickedCount} hand-picked)), ` +
    `${Buffer.byteLength(serialized)} bytes`,
);
