#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static hawker-closure bundle (public/hawker-closures.json) from NEA's
 * "Dates of Hawker Centres Closure" (data.gov.sg, Singapore Open Data
 * Licence), joined by hawker-centre id onto the hawkers in
 * public/amenities.json.
 *
 * This is deliberately a separate script and output from
 * scripts/fetch-amenities.mjs: that script also refetches malls and their
 * Wikimedia Commons photos (paced, rate-limited), so refreshing closures
 * there would regenerate the whole amenities bundle and its photos for a
 * yearly schedule update. This script only reads the existing
 * public/amenities.json to resolve ids; the runtime join in
 * lib/data/amenities.ts pairs each hawker with its periods, so rerunning
 * fetch-amenities.mjs later does not invalidate this file.
 *
 * Join: exact (normalised) name first; the remaining name variants
 * ("Bukit Panjang Hawker Centre and Market") fall back to the nearest
 * hawker centre within 150 m. Centres with no closure row (new/planned
 * centres) simply have no entry. Only names, dates, remarks, and
 * coordinates are read; the CSV's photo/address/description columns are
 * ignored, so no personal data can reach the bundle.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { inSingapore, text } from "./lib/place-fields.mjs";

const CLOSURE_DATASET = "d_bda4baa634dd1cc7a6c7cad5f19e2d68";

// A handful of `other_works` rows announce a centre's opening, not a
// closure; a closure period for them would mislead the popup.
const OPENING_REMARKS_RE = /will commence its operations/i;

const cleanRemark = (value) => {
  const remark = text(value);
  return remark && remark.toLowerCase() !== "nil" ? remark : null;
};
const normalizeName = (name) =>
  name.toLowerCase().replace(/&/g, "and").replace(/\bsingapore\b/g, "").replace(/[^a-z0-9]/g, "");

// Equirectangular metres; accurate to well under 1% for sub-km joins.
const distMetres = (aLat, aLng, bLat, bLng) => {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = (((bLng - aLng) * Math.PI) / 180) * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat * 6371000, dLng * 6371000);
};

// Source dates are D/M/YYYY with NA/TBC/blank for "not scheduled"; only
// real calendar dates become ISO periods.
const toIsoDate = (value) => {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text(value) ?? "");
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const roundTrip = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toISOString().slice(0, 10);
  return iso === roundTrip ? iso : null;
};

// Minimal RFC 4180 parser: the CSV quotes address/description fields.
const parseCsv = (raw) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (quoted) {
      if (char === '"') {
        if (raw[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && raw[i + 1] === "\n") i++;
      if (row.length || field) { row.push(field); rows.push(row); row = []; field = ""; }
    } else field += char;
  }
  if (row.length || field) { row.push(field); rows.push(row); }
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) =>
    Object.fromEntries(header.map((name, index) => [name, r[index] ?? ""])),
  );
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url.slice(0, 160)}`);
  return response.text();
};

const period = (kind, startRaw, endRaw, remarksRaw) => {
  const start = toIsoDate(startRaw);
  const end = toIsoDate(endRaw);
  if (!start || !end || end < start) return null;
  return { kind, start, end, remarks: cleanRemark(remarksRaw) };
};

const hawkers = (JSON.parse(await readFile("public/amenities.json", "utf8"))).hawkers ?? [];
if (!hawkers.length) throw new Error("public/amenities.json has no hawkers; run fetch-amenities.mjs first");
const hawkerByName = new Map(hawkers.map((hawker) => [normalizeName(hawker.name), hawker]));

const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${CLOSURE_DATASET}/poll-download`);
const url = poll?.data?.url;
if (!url) throw new Error(`No presigned URL returned for ${CLOSURE_DATASET}`);
const rows = parseCsv(await fetchText(url));
if (rows.length < 100) throw new Error(`Closure dataset returned only ${rows.length} rows`);

const closuresById = new Map();
let exact = 0;
let nearest = 0;
const unmatched = [];
for (const row of rows) {
  const name = text(row.name);
  if (!name) continue;
  const periods = [
    ...["q1", "q2", "q3", "q4"].map((q) => period("cleaning", row[`${q}_cleaningstartdate`], row[`${q}_cleaningenddate`], row[`remarks_${q}`])),
    OPENING_REMARKS_RE.test(row.remarks_other_works ?? "")
      ? null
      : period("other-works", row.other_works_startdate, row.other_works_enddate, row.remarks_other_works),
  ].filter(Boolean);
  if (!periods.length) continue;

  let hawker = hawkerByName.get(normalizeName(name));
  if (hawker) exact += 1;
  else {
    const lat = Number(row.latitude_hc);
    const lng = Number(row.longitude_hc);
    const candidate = inSingapore(lat, lng)
      ? hawkers.reduce((best, h) => (best && distMetres(lat, lng, best.lat, best.lng) <= distMetres(lat, lng, h.lat, h.lng) ? best : h), null)
      : null;
    if (candidate && distMetres(lat, lng, candidate.lat, candidate.lng) <= 150) {
      hawker = candidate;
      nearest += 1;
    } else {
      unmatched.push(name);
      continue;
    }
  }
  periods.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  closuresById.set(hawker.id, periods);
}

if (closuresById.size < 100) throw new Error(`Only ${closuresById.size} hawker centres joined to a closure row`);
const totalPeriods = [...closuresById.values()].reduce((count, periods) => count + periods.length, 0);
if (totalPeriods < 400) throw new Error(`Only ${totalPeriods} closure periods parsed`);

const bundle = Object.fromEntries([...closuresById].sort((a, b) => a[0].localeCompare(b[0])));
const serialized = JSON.stringify(bundle);
await mkdir("public", { recursive: true });
await writeFile("public/hawker-closures.json", serialized);
console.log(
  `Hawker closures: ${closuresById.size} centres with ${totalPeriods} periods ` +
    `(${exact} exact-name joins, ${nearest} nearest-within-150m; ${unmatched.length} unmatched: ${unmatched.join("; ") || "none"}), ${Buffer.byteLength(serialized)} bytes`,
);
