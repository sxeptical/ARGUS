#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static MOE schools bundle (public/schools.json) from:
 *  - MOE "General information of schools" (data.gov.sg, Singapore Open
 *    Data Licence): 337 rows, no coordinates. Only the whitelisted fields
 *    below are read; the principal/VP name columns are never read or
 *    stored. `mainlevel_code` maps to the level sub-filter.
 *  - Coordinates: OneMap search API by school name (best name+postal
 *    match), falling back to an OpenStreetMap `amenity=school` join by
 *    normalised name + postcode. OneMap currently returns results without
 *    a token (with an auth warning); no token is stored. Results are
 *    cached by name within the run and paced politely.
 *
 * Fails its guard if fewer than 320 schools geocode.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";

const MOE_DATASET = "d_688b934f82c1059ed0a6993d2a829089";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const ONEMAP_BASE = "https://www.onemap.gov.sg/api/common/elastic/search";
const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
const round = (value) => Math.round(value * 1e6) / 1e6;
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalize = (name) =>
  String(name ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
// Looser identity for matching: drops parentheticals ("(PRIMARY)"), unifies
// "st"/"saint" and "govt"/"government", so MOE punctuation variants still
// join to OneMap/OSM names ("ST. ANTHONY'S PRIMARY SCHOOL" ↔
// "SAINT ANTHONY'S PRIMARY SCHOOL").
const normalizeLoose = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bsaint\b/g, "st")
    .replace(/\bgovernment\b/g, "govt")
    .replace(/\s+/g, " ")
    .trim();
const slug = (name) => normalize(name) || "school";

// Only these columns are read. principal/VP name columns are deliberately
// never read or stored.
const levelOf = (code) => {
  const c = (code ?? "").toUpperCase();
  if (c.startsWith("PRIMARY")) return "primary";
  if (c.startsWith("SECONDARY")) return "secondary";
  if (c.startsWith("MIXED")) return "mixed";
  return "jc"; // JUNIOR COLLEGE, CENTRALISED INSTITUTE
};

// Minimal RFC4180 CSV parser (quoted fields, doubled quotes, embedded commas).
const parseCsv = (csv) => {
  const rows = [];
  let cur = "";
  let row = [];
  let inQuote = false;
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i];
    if (inQuote) {
      if (c === '"') {
        if (csv[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = false;
      } else cur += c;
    } else if (c === '"') inQuote = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
};

const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${MOE_DATASET}/poll-download`);
const url = poll?.data?.url;
if (!url) throw new Error(`No presigned URL returned for ${MOE_DATASET}`);
const csv = await fetch(url, { headers: { "User-Agent": USER_AGENT } }).then((r) => r.text());
const rows = parseCsv(csv);
const header = rows[0];
const col = Object.fromEntries(header.map((name, i) => [name, i]));
const pick = (row, key) => text(row[col[key]]);
const phoneOf = (raw) => {
  const digits = text(raw)?.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 8) return `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits.startsWith("65") && digits.length === 10
    ? `+65 ${digits.slice(2, 6)} ${digits.slice(6)}`
    : text(raw);
};

const schools = [];
for (const row of rows.slice(1)) {
  const name = pick(row, "school_name");
  if (!name) continue;
  const level = levelOf(pick(row, "mainlevel_code"));
  const address = pick(row, "address");
  const postal = pick(row, "postal_code") || null;
  const website = pick(row, "url_address");
  const fullAddress = address
    ? `${address}${postal ? `, Singapore ${postal}` : ""}`
    : postal ? `Singapore ${postal}` : null;
  schools.push({
    id: `moe-${slug(name)}`,
    name,
    level,
    address: fullAddress,
    postalCode: postal,
    phone: phoneOf(pick(row, "telephone_no") === "na" ? null : pick(row, "telephone_no")),
    website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
    mrt: pick(row, "mrt_desc"),
    bus: text(pick(row, "bus_desc")) === "na" ? null : pick(row, "bus_desc"),
    lat: null,
    lng: null,
    coordsSource: null,
  });
}

if (schools.length < 330) throw new Error(`MOE dataset returned only ${schools.length} schools`);

// --- OneMap (best name match; results are cached per name) ---
const onemapCache = new Map();
async function onemapCoords(name, postal) {
  if (onemapCache.has(name)) return onemapCache.get(name);
  let best = null;
  // Try the name as-is, then its loose variant (SAINT for ST, etc.).
  const queries = [...new Set([name, normalizeLoose(name).replace(/\bst\b/g, "saint").toUpperCase()])];
  for (const query of queries) {
    for (let attempt = 1; attempt <= 3 && !best; attempt++) {
      try {
        const res = await fetch(
          `${ONEMAP_BASE}?${new URLSearchParams({
            searchVal: query,
            returnGeom: "Y",
            getAddrDetails: "Y",
            pageNum: "1",
          })}`,
          { headers: { "User-Agent": USER_AGENT } },
        );
        const body = await res.text();
        let data;
        try { data = JSON.parse(body); } catch { data = null; }
        if (!res.ok || !data || !Array.isArray(data.results)) {
          await sleep(attempt * 2000);
          continue;
        }
        const wanted = normalizeLoose(name);
        const wantedTokens = wanted.split(" ");
        const score = (result) => {
          if (!inSingapore(Number(result.LATITUDE), Number(result.LONGITUDE))) return -1;
          // "X @ SCHOOL" entries are co-located businesses (tuition
          // centres), not the school itself; OSM covers those instead.
          if (String(result.SEARCHVAL ?? "").includes("@")) return -1;
          let points = 0;
          const got = normalizeLoose(result.SEARCHVAL ?? result.BUILDING);
          if (!got) return -1;
          if (got === wanted) points += 4;
          const postalMatch = postal && String(result.POSTAL ?? "").trim() === postal;
          if (postalMatch) points += 2;
          if (got.includes(wanted) || wanted.includes(got)) points += 1;
          const gotTokens = new Set(got.split(" "));
          if (gotTokens.size && [...gotTokens].every((token) => wantedTokens.includes(token))) points += 1;
          if (points < 4 && !(postalMatch && points >= 3)) return -1;
          return points;
        };
        best = data.results
          .map((result) => ({ result, score: score(result) }))
          .filter(({ score }) => score >= 1)
          .sort((a, b) => b.score - a.score)[0]?.result ?? null;
      } catch {
        await sleep(attempt * 2000);
      }
    }
    if (best) break;
  }
  // Pace the API politely and cache so repeats are free.
  const coords = best
    ? { lat: round(Number(best.LATITUDE)), lng: round(Number(best.LONGITUDE)) }
    : null;
  onemapCache.set(name, coords);
  await sleep(400);
  return coords;
}

// --- OSM fallback (name match, postcode preferred) ---
const overpass = await fetchJson(OVERPASS_URL, {
  method: "POST",
  headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    data: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["amenity"="school"](area.a);out center tags;`,
  }),
});
const osmByName = new Map();
for (const element of overpass.elements ?? []) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  const name = text(element.tags?.name);
  if (!name || !inSingapore(lat, lng)) continue;
  const key = normalizeLoose(name);
  if (!key) continue;
  const entry = { lat: round(lat), lng: round(lng), postcode: text(element.tags?.["addr:postcode"]) };
  if (!osmByName.has(key)) osmByName.set(key, []);
  osmByName.get(key).push(entry);
}
const osmCoords = (name, postal) => {
  const candidates = osmByName.get(normalizeLoose(name)) ?? [];
  if (!candidates.length) return null;
  const exact = candidates.find((c) => postal && c.postcode === postal);
  const picked = exact ?? candidates[0];
  return { lat: picked.lat, lng: picked.lng };
};

let geocodedOneMap = 0;
let geocodedOsm = 0;
const ungeocoded = [];
for (const school of schools) {
  const onemap = await onemapCoords(school.name, school.postalCode);
  if (onemap) {
    school.lat = onemap.lat;
    school.lng = onemap.lng;
    school.coordsSource = "onemap";
    geocodedOneMap++;
  } else {
    const osm = osmCoords(school.name, school.postalCode);
    if (osm) {
      school.lat = osm.lat;
      school.lng = osm.lng;
      school.coordsSource = "osm";
      geocodedOsm++;
    } else {
      ungeocoded.push(school.name);
    }
  }
}
const geocoded = geocodedOneMap + geocodedOsm;
if (geocoded < 320) {
  throw new Error(`Only ${geocoded} schools geocoded (OneMap ${geocodedOneMap}, OSM ${geocodedOsm}); ungeocoded: ${ungeocoded.slice(0, 10).join("; ")}`);
}

const kept = schools.filter((school) => school.lat !== null && school.lng !== null);
kept.sort((a, b) => a.name.localeCompare(b.name, "en-SG"));

const serialized = JSON.stringify(kept);
await mkdir("public", { recursive: true });
await writeFile("public/schools.json", serialized);
console.log(
  `School bundle: ${kept.length} schools ` +
    `(OneMap ${geocodedOneMap}, OSM ${geocodedOsm}, ${ungeocoded.length} ungeocoded; ` +
    `levels: ${Object.entries(kept.reduce((acc, s) => { acc[s.level] = (acc[s.level] ?? 0) + 1; return acc; }, {})).map(([l, n]) => `${l} ${n}`).join(", ")}), ${Buffer.byteLength(serialized)} bytes`,
);
