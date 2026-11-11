#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static healthcare bundle (public/healthcare.json) from:
 *  - MOH CHAS Clinics (data.gov.sg, Singapore Open Data Licence): 1,193
 *    points, all attributes packed in the KML HTML `Description` (parsed
 *    with scripts/lib/kml-description.mjs). HCI_CODE is the unique id.
 *    LICENCE_TYPE (MC/MD) is not a GP-vs-dental split and is ignored.
 *    Content vintage is September 2021 (FMEL 202109); the UI says so.
 *    `CLINIC_PROGRAMME_CODE` (CHAS/CDMP/ISP participation) is kept.
 *    One point falls outside Singapore bounds and is dropped.
 *  - OpenStreetMap `amenity=hospital` and `amenity=dentist` (ODbL): named,
 *    not `access=private`. OSM `amenity=clinic` is not added; CHAS is the
 *    GP register.
 *
 * Photos are Wikimedia Commons only, hospitals only, via the place-photos
 * helper. Freshness is per-record FMEL_UPD_D for CHAS; no catalogue date
 * is trusted.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { fetchPlacePhotos } from "./lib/place-photos.mjs";
import { parseKmlDescription, text } from "./lib/kml-description.mjs";

const CHAS_DATASET = "d_548c33ea2d99e29ec63a7cc9edcccedc";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
const round = (value) => Math.round(value * 1e6) / 1e6;

// "1 Joo Koon Circle, Fairprice Hub, Singapore 629117"
const composeAddress = (p) => {
  const street = [text(p.BLK_HSE_NO), text(p.STREET_NAME)].filter(Boolean).join(" ");
  const base = [street, text(p.BUILDING_NAME)].filter(Boolean).join(", ");
  const postcode = text(p.POSTAL_CD);
  return base ? `${base}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
};

// "68615755" -> "+65 6861 5755"; anything else is kept as tagged.
const phoneOf = (raw) => {
  const digits = text(raw)?.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 8) return `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits.startsWith("65") && digits.length === 10
    ? `+65 ${digits.slice(2, 6)} ${digits.slice(6)}`
    : text(raw);
};

const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${CHAS_DATASET}/poll-download`);
const url = poll?.data?.url;
if (!url) throw new Error(`No presigned URL returned for ${CHAS_DATASET}`);
const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
const features = data?.features ?? [];

const clinics = [];
const chimSkipped = [];
for (const feature of features) {
  if (feature.geometry?.type !== "Point") continue;
  const p = parseKmlDescription(feature.properties?.Description);
  const name = text(p.HCI_NAME);
  const code = text(p.HCI_CODE);
  const [lng, lat] = feature.geometry.coordinates ?? [];
  if (!name || !code || !inSingapore(lat, lng)) {
    chimSkipped.push(name ?? "(unnamed)");
    continue;
  }
  clinics.push({
    id: `chas-${code}`,
    name,
    kind: "gp",
    address: composeAddress(p),
    phone: phoneOf(p.HCI_TEL),
    programmes: String(p.CLINIC_PROGRAMME_CODE ?? "").split(",").map((v) => v.trim()).filter(Boolean),
    lat: round(lat),
    lng: round(lng),
    source: "chas",
  });
}

async function fetchOsm(kind, osmAmenity) {
  const overpass = await fetchJson(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      data: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["amenity"="${osmAmenity}"](area.a);out center tags;`,
    }),
  });
  const places = [];
  const skipped = [];
  for (const element of overpass.elements ?? []) {
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    const name = text(element.tags?.name);
    const tags = element.tags ?? {};
    if (!name || tags.access === "private" || !inSingapore(lat, lng)) {
      skipped.push(name ?? "(unnamed)");
      continue;
    }
    const street = [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" ");
    const postcode = text(tags["addr:postcode"]);
    const address = street ? `${street}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
    places.push({
      id: `osm-${element.type}-${element.id}`,
      name,
      kind,
      address,
      phone: phoneOf(tags.phone),
      programmes: [],
      lat: round(lat),
      lng: round(lng),
      source: "osm",
    });
  }
  return { places, skipped };
}

const hospitals = await fetchOsm("hospital", "hospital");
const dentists = await fetchOsm("dental", "dentist");

const sites = [...clinics, ...hospitals.places, ...dentists.places].sort((a, b) =>
  a.name.localeCompare(b.name, "en-SG"),
);
if (sites.length < 1400) throw new Error(`Healthcare sources returned only ${sites.length} named sites`);

// Photos: hospitals only, Commons only (see header).
const hospitalPlaces = sites.filter((site) => site.kind === "hospital");
const { photos, stats } = await fetchPlacePhotos(hospitalPlaces, {
  overpassQuery: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["amenity"="hospital"]["wikidata"](area.a);out center tags;`,
  radiusM: 300,
  searchNames: (site) => [site.name],
});
const withPhotos = sites.map((site) => ({ ...site, photos: photos.get(site.id) ?? [] }));
const photoCount = withPhotos.filter((site) => site.photos.length).length;

const serialized = JSON.stringify(withPhotos);
await mkdir("public", { recursive: true });
await writeFile("public/healthcare.json", serialized);
console.log(
  `Healthcare bundle: ${sites.length} sites ` +
    `(${clinics.length} GP clinics, ${hospitals.places.length} hospitals, ${dentists.places.length} dental; ` +
    `${chimSkipped.length + hospitals.skipped.length + dentists.skipped.length} skipped; photos on ${photoCount} ` +
    `(${stats.matched} matched to a Wikidata item, ${stats.searched} label searches)), ${Buffer.byteLength(serialized)} bytes`,
);
