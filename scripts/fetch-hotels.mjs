#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static hotel bundle (public/hotels.json) from the Hotels Licensing Board
 * "Hotels" dataset (data.gov.sg, Singapore Open Data Licence), with
 * Wikimedia Commons photos where a hotel has a Wikidata item (bridged via
 * OSM `tourism=hotel` `wikidata` tags, else label search — see
 * lib/place-photos.mjs). Only freely licensed Commons media is used; never
 * hotel marketing imagery.
 *
 * Data hygiene: KEEPERNAME (licensee personal names) and HYPERLINK (an
 * email/contact string, not a URL — it must never be rendered as a website
 * link) are deliberately dropped and never reach the bundle. The GeoJSON
 * carries no street address, only a postal code; the display address is
 * the bare postcode. Freshness is per-record FMEL_UPD_D; no catalogue date
 * is trusted.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { fetchPlacePhotos } from "./lib/place-photos.mjs";
import { inSingapore, round, text } from "./lib/place-fields.mjs";

const HOTEL_DATASET = "d_654e22f14e5bb817423f0e0c9ac4f632";

// TOTALROOMS is a string, sometimes comma-grouped ("1,838").
const roomCount = (value) => {
  const rooms = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(rooms) && rooms > 0 ? Math.round(rooms) : null;
};

const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${HOTEL_DATASET}/poll-download`);
const url = poll?.data?.url;
if (!url) throw new Error(`No presigned URL returned for ${HOTEL_DATASET}`);
const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
const features = data?.features ?? [];

const hotels = [];
const skipped = [];
for (const feature of features) {
  if (feature.geometry?.type !== "Point") continue;
  const props = feature.properties ?? {};
  const name = text(props.NAME);
  const [lng, lat] = feature.geometry.coordinates ?? [];
  if (!name || props.OBJECTID == null || !inSingapore(lat, lng)) {
    skipped.push(name ?? "(unnamed)");
    continue;
  }
  // KEEPERNAME and HYPERLINK are intentionally unread (see header).
  hotels.push({
    id: `hotel-${props.OBJECTID}`,
    name,
    address: text(props.POSTALCODE) ? `Singapore ${props.POSTALCODE}` : null,
    rooms: roomCount(props.TOTALROOMS),
    lat: round(lat),
    lng: round(lng),
  });
}
hotels.sort((a, b) => a.name.localeCompare(b.name, "en-SG"));
if (hotels.length < 400) throw new Error(`Hotel dataset returned only ${hotels.length} hotels`);

// Photos via the reusable placer: OSM `tourism=hotel` `wikidata` bridge
// first, then Wikidata label search, both gated on name + ~300 m proximity.
const { photos, stats } = await fetchPlacePhotos(hotels, {
  overpassQuery: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["tourism"="hotel"]["wikidata"](area.a);out center tags;`,
  radiusM: 300,
  searchNames: (hotel) => [hotel.name],
});
const withPhotos = hotels.map((hotel) => ({ ...hotel, photos: photos.get(hotel.id) ?? [] }));
const photoCount = withPhotos.filter((hotel) => hotel.photos.length).length;

const serialized = JSON.stringify(withPhotos);
await mkdir("public", { recursive: true });
await writeFile("public/hotels.json", serialized);
console.log(
  `Hotel bundle: ${hotels.length} hotels (${skipped.length} skipped${skipped.length ? `: ${skipped.join("; ")}` : ""}; ` +
    `photos on ${photoCount}; ${stats.matched} matched to a Wikidata item, ${stats.searched} label searches), ${Buffer.byteLength(serialized)} bytes`,
);
