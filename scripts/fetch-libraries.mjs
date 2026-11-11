#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static public-library bundle (public/libraries.json) from:
 *  - NLB Libraries (data.gov.sg, Singapore Open Data Licence): 27 points
 *    (24 public libraries, National Library, 3 library@ mall kiosks), all
 *    attributes packed in the KML HTML `Description` (parsed with
 *    scripts/lib/kml-description.mjs); DESCRIPTION carries the branch code
 *    (SRPL, OCPL, ...). Content vintage is 2019 (FMEL 201904); the UI says
 *    so. The dataset's HYPERLINK/PHOTOURL (2019 nlb.gov.sg DotNetNuke URLs)
 *    are deliberately NOT used: they 301 into a bot-wall (HTTP 202) and do
 *    not resolve to branch pages.
 *  - OpenStreetMap `amenity=library` with `operator` ~ "National Library
 *    Board" (ODbL): only branches the 2019 NLB list is missing are added
 *    (Punggol Regional Library, opened 2022). OSM entries within ~1 km of
 *    an NLB branch (e.g. library@harbourfront, Ang Mo Kio Library) are the
 *    same outlets and skipped.
 *
 * Photos are Wikimedia Commons only, via the place-photos helper. Freshness
 * is per-record FMEL_UPD_D for NLB; no catalogue date is trusted.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { fetchPlacePhotos } from "./lib/place-photos.mjs";
import { parseKmlDescription } from "./lib/kml-description.mjs";
import { inSingapore, round, text } from "./lib/place-fields.mjs";

const NLB_DATASET = "d_27b8dae65d9ca1539e14d09578b17cbf";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Equirectangular metres, for the NLB/OSM duplicate check.
const distMetres = (a, b) => {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = (((b.lng - a.lng) * Math.PI) / 180) * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat * 6371000, dLng * 6371000);
};

// "23 Serangoon Central, NEX, #04, Singapore 556083"
const composeAddress = (p) => {
  const street = [text(p.ADDRESSBLOCKHOUSENUMBER), text(p.ADDRESSSTREETNAME)].filter(Boolean).join(" ");
  const floor = text(p.ADDRESSFLOORNUMBER);
  const unit = text(p.ADDRESSUNITNUMBER);
  const unitPart = floor ? `#${String(floor).padStart(2, "0")}${unit ? `-${unit}` : ""}` : unit ?? null;
  const base = [street, text(p.ADDRESSBUILDINGNAME), unitPart].filter(Boolean).join(", ");
  const postcode = text(p.ADDRESSPOSTALCODE);
  return base ? `${base}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
};

const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${NLB_DATASET}/poll-download`);
const url = poll?.data?.url;
if (!url) throw new Error(`No presigned URL returned for ${NLB_DATASET}`);
const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
const features = data?.features ?? [];

const libraries = [];
const nlbSkipped = [];
for (const feature of features) {
  if (feature.geometry?.type !== "Point") continue;
  const p = parseKmlDescription(feature.properties?.Description);
  const name = text(p.NAME);
  const code = text(p.DESCRIPTION);
  const [lng, lat] = feature.geometry.coordinates ?? [];
  if (!name || !inSingapore(lat, lng)) {
    nlbSkipped.push(name ?? "(unnamed)");
    continue;
  }
  // HYPERLINK/PHOTOURL intentionally unread (see header).
  libraries.push({
    id: `nlb-${String(code ?? name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    branch: code,
    address: composeAddress(p),
    lat: round(lat),
    lng: round(lng),
    source: "nlb",
  });
}

// Add NLB branches postdating the 2019 dataset from OSM (operator tag), if
// they sit more than 1 km from every NLB branch (dedupe).
const overpass = await fetchJson(OVERPASS_URL, {
  method: "POST",
  headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    data: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["amenity"="library"]["operator"~"National Library Board"](area.a);out center tags;`,
  }),
});
const added = [];
for (const element of overpass.elements ?? []) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  const name = text(element.tags?.name);
  if (!name || !inSingapore(lat, lng)) continue;
  if (libraries.some((library) => distMetres(library, { lat, lng }) <= 1000)) continue;
  const tags = element.tags ?? {};
  const street = [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" ");
  const postcode = text(tags["addr:postcode"]);
  const address = street ? `${street}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
  added.push({
    id: `osm-${element.type}-${element.id}`,
    name,
    branch: null,
    address,
    lat: round(lat),
    lng: round(lng),
    source: "osm",
  });
}
libraries.push(...added);
libraries.sort((a, b) => a.name.localeCompare(b.name, "en-SG"));
if (libraries.length < 28) throw new Error(`Library sources returned only ${libraries.length} branches`);

// Photos: Commons only (see header). The library wikidata bridge covers OSM
// branches directly; NLB branches match on name + proximity.
const { photos, stats } = await fetchPlacePhotos(libraries, {
  overpassQuery: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["amenity"="library"]["wikidata"](area.a);out center tags;`,
  radiusM: 300,
  searchNames: (library) => [library.name],
});
const withPhotos = libraries.map((library) => ({ ...library, photos: photos.get(library.id) ?? [] }));
const photoCount = withPhotos.filter((library) => library.photos.length).length;

const serialized = JSON.stringify(withPhotos);
await mkdir("public", { recursive: true });
await writeFile("public/libraries.json", serialized);
console.log(
  `Library bundle: ${libraries.length} branches ` +
    `(${nlbSkipped.length} skipped; ${added.length} added from OSM: ${added.map((l) => l.name).join("; ") || "none"}; photos on ${photoCount} ` +
    `(${stats.matched} matched to a Wikidata item, ${stats.searched} label searches)), ${Buffer.byteLength(serialized)} bytes`,
);
