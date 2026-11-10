#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static retail-pharmacy bundle (public/pharmacies.json) from HSA's "Retail
 * pharmacy locations (GEOJSON)" (data.gov.sg, Singapore Open Data Licence).
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos. The CSV listing of the same dataset is not used:
 * it carries pharmacist personal names, which must not reach the bundle.
 * Similarly, the GeoJSON's BUILDING_NAME is always the literal "Singapore"
 * in this dataset, so it is dropped rather than shown as a building.
 *
 * Freshness is per-record FMEL_UPD_D; no catalogue date is trusted.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";

const PHARMACY_DATASET = "d_bb92615f43de22933e4479558b1f6c36";
const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
const round = (value) => Math.round(value * 1e6) / 1e6;
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

// Source road names are upper case; other layers' addresses are mixed case.
const titleCase = (value) =>
  value.split(" ").map((word) => (word ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word)).join(" ");

// "200 Victoria Street, #02-29 TO 33/33A, Singapore 188021": LEVEL_NO already
// carries the "#" ("#02"), so the unit part is "#02-29 TO 33/33A".
const composeAddress = (props) => {
  const road = text(props.ROAD_NAME);
  const street = [text(props.HOUSE_BLK_NO), road ? titleCase(road) : null].filter(Boolean).join(" ");
  const level = text(props.LEVEL_NO);
  const unit = text(props.UNIT_NO);
  const unitPart = level ? `${level}${unit ? `-${unit}` : ""}` : unit ? `#${unit}` : null;
  const base = [street, unitPart].filter(Boolean).join(", ");
  const postcode = text(props.POSTAL_CODE);
  return base ? `${base}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
};

const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${PHARMACY_DATASET}/poll-download`);
const url = poll?.data?.url;
if (!url) throw new Error(`No presigned URL returned for ${PHARMACY_DATASET}`);
const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT } });
const features = data?.features ?? [];

const pharmacies = [];
const skipped = [];
for (const feature of features) {
  if (feature.geometry?.type !== "Point") continue;
  const props = feature.properties ?? {};
  const name = text(props.PHARMACY_NAME);
  const [lng, lat] = feature.geometry.coordinates ?? [];
  if (!name || props.OBJECTID_1 == null || !inSingapore(lat, lng)) {
    skipped.push(name ?? "(unnamed)");
    continue;
  }
  pharmacies.push({
    id: `pharmacy-${props.OBJECTID_1}`,
    name,
    address: composeAddress(props),
    lat: round(lat),
    lng: round(lng),
  });
}
pharmacies.sort((a, b) => a.name.localeCompare(b.name, "en-SG"));
if (pharmacies.length < 200) throw new Error(`Pharmacy dataset returned only ${pharmacies.length} pharmacies`);

const serialized = JSON.stringify(pharmacies);
await mkdir("public", { recursive: true });
await writeFile("public/pharmacies.json", serialized);
console.log(
  `Pharmacy bundle: ${pharmacies.length} pharmacies (${skipped.length} skipped${skipped.length ? `: ${skipped.join("; ")}` : ""}), ${Buffer.byteLength(serialized)} bytes`,
);
