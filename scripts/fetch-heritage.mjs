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
 * helper (OSM `wikidata` bridge + label search, name + <=300 m gate).
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
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { fetchPlacePhotos } from "./lib/place-photos.mjs";
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
    sites.push({
      id: `heritage-${kind === "monument" ? "monument" : "historic"}-${props[idKey]}`,
      name,
      kind,
      address: composeAddress(props),
      description: text(props.DESCRIPTION),
      website: websiteOf(props.HYPERLINK),
      lat: round(lat),
      lng: round(lng),
      source: "nhb",
    });
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

// Photos: Commons only (see header re NHB PHOTOURL). The museum wikidata
// bridge covers OSM museums directly and many NHB sites share their
// buildings; NHB markers also match on name + proximity.
const { photos, stats } = await fetchPlacePhotos(sites, {
  overpassQuery: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["tourism"="museum"]["wikidata"](area.a);out center tags;`,
  radiusM: 300,
  searchNames: (site) => [site.name],
});
const withPhotos = sites.map((site) => ({ ...site, photos: photos.get(site.id) ?? [] }));
const photoCount = withPhotos.filter((site) => site.photos.length).length;

const serialized = JSON.stringify(withPhotos);
await mkdir("public", { recursive: true });
await writeFile("public/heritage.json", serialized);
console.log(
  `Heritage bundle: ${sites.length} sites ` +
    `(${historic.sites.length} historic sites, ${monumentsResult.sites.length} monuments, ${museums.length} museums; ` +
    `${historic.skipped.length + monumentsResult.skipped.length + osmSkipped.length} skipped; photos on ${photoCount} ` +
    `(${stats.matched} matched to a Wikidata item, ${stats.searched} label searches)), ${Buffer.byteLength(serialized)} bytes`,
);
