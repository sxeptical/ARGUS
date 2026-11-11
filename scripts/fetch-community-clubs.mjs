#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static community-club bundle (public/community-clubs.json) from the
 * People's Association "Community Club / PAssion WaVe Outlet" dataset
 * (data.gov.sg, Singapore Open Data Licence).
 *
 * Both outlet kinds are kept: DESCRIPTION = "CC" (community clubs) and
 * "PAssionWave" (sea-sports outlets), distinguished by `kind`. The
 * dataset's HYPERLINK is a single generic PA page rather than a per-club
 * URL, so it is not stored. Freshness is per-record FMEL_UPD_D; no
 * catalogue date is trusted.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { fetchPlacePhotos } from "./lib/place-photos.mjs";

const CC_DATASET = "d_9de02d3fb33d96da1855f4fbef549a0f";
const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
const round = (value) => Math.round(value * 1e6) / 1e6;
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

const kindOf = (description) =>
  description === "CC" ? "community-club" : description === "PAssionWave" ? "passionwave" : null;

// "259C Punggol Field, #01-47, Singapore 823259": block + street, then the
// floor/unit (PA's "#floor-unit" convention), then the postcode.
const composeAddress = (props) => {
  const street = [text(props.ADDRESSBLOCKHOUSENUMBER), text(props.ADDRESSSTREETNAME)].filter(Boolean).join(" ");
  const floor = text(props.ADDRESSFLOORNUMBER);
  const unit = text(props.ADDRESSUNITNUMBER);
  const unitPart = floor ? `#${floor.padStart(2, "0")}${unit ? `-${unit}` : ""}` : unit ?? null;
  const building = text(props.ADDRESSBUILDINGNAME);
  const base = [street, unitPart, building].filter(Boolean).join(", ");
  const postcode = text(props.ADDRESSPOSTALCODE);
  return base ? `${base}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
};

const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${CC_DATASET}/poll-download`);
const url = poll?.data?.url;
if (!url) throw new Error(`No presigned URL returned for ${CC_DATASET}`);
const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
const features = data?.features ?? [];

const clubs = [];
const skipped = [];
for (const feature of features) {
  if (feature.geometry?.type !== "Point") continue;
  const props = feature.properties ?? {};
  const kind = kindOf(text(props.DESCRIPTION));
  const name = text(props.NAME);
  const [lng, lat] = feature.geometry.coordinates ?? [];
  if (!kind || !name || props.OBJECTID == null || !inSingapore(lat, lng)) {
    skipped.push(name ?? "(unnamed)");
    continue;
  }
  clubs.push({
    id: `cc-${props.OBJECTID}`,
    name,
    kind,
    address: composeAddress(props),
    lat: round(lat),
    lng: round(lng),
  });
}
clubs.sort((a, b) => a.name.localeCompare(b.name, "en-SG"));
if (clubs.length < 120) throw new Error(`Community club dataset returned only ${clubs.length} outlets`);

// Photos: the dataset's PHOTOURL/HYPERLINK are empty, so bridge each club to
// a Wikidata item (OSM `amenity=community_centre` `wikidata` tag, else label
// search) and take freely licensed Commons photos — see lib/place-photos.mjs.
// No PA or other copyrighted imagery is ever used.
const { photos, stats } = await fetchPlacePhotos(clubs, {
  overpassQuery: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["amenity"="community_centre"]["wikidata"](area.a);out center tags;`,
  radiusM: 300,
  searchNames: (club) => [club.name, club.name.replace(/\bCC\b/g, "Community Club")],
});
const withPhotos = clubs.map((club) => ({ ...club, photos: photos.get(club.id) ?? [] }));
const photoCount = withPhotos.filter((club) => club.photos.length).length;

const serialized = JSON.stringify(withPhotos);
await mkdir("public", { recursive: true });
await writeFile("public/community-clubs.json", serialized);
console.log(
  `Community club bundle: ${clubs.length} outlets ` +
    `(${clubs.filter((club) => club.kind === "community-club").length} community clubs, ${clubs.filter((club) => club.kind === "passionwave").length} PAssion WaVe; ` +
    `${skipped.length} skipped${skipped.length ? `: ${skipped.join("; ")}` : ""}; photos on ${photoCount} ` +
    `(${stats.matched} matched to a Wikidata item, ${stats.searched} label searches)), ${Buffer.byteLength(serialized)} bytes`,
);
