#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static supermarket bundle (public/supermarkets.json) from OpenStreetMap
 * `shop=supermarket` (ODbL): named, in Singapore bounds, not clearly
 * mistagged non-supermarkets. No photos.
 *
 * Brand is normalised to the operator (NTUC FairPrice incl. Finest/Xtra/
 * Xpress, Cold Storage incl. CS Fresh, Sheng Siong, Giant, Prime, Don Don
 * Donki, Ang Mo, U Stars, Hao Mart, Scarlett) via `brand:wikidata` first,
 * then whole-token matching on name/brand/operator; everything else
 * counts as "Other". Unnamed ways/nodes are dropped. One electronics store
 * mistagged as a supermarket (Bizgram) is dropped.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
const round = (value) => Math.round(value * 1e6) / 1e6;
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

// brand:wikidata values seen on Singapore supermarkets (verified 2026-11-10).
const BRAND_BY_WIKIDATA = new Map([
  ["Q6955519", "NTUC FairPrice"], // NTUC FairPrice
  ["Q3481878", "Sheng Siong"],
  ["Q4217013", "Giant"], // Giant Hypermarket
  ["Q5142390", "Cold Storage"],
  ["Q60744255", "Prime"], // Prime Supermarket
  ["Q62122839", "Prime"],
  ["Q1185381", "Don Don Donki"],
]);

// Whole-token rules, in check order. Tokens come from the name, brand and
// operator lower-cased and split on non-alphanumerics, so "FairPrice
// Finest" matches fairprice and "CS Fresh" matches cs+fresh, while
// "Prime" inside a longer word never matches.
const BRAND_TOKEN_RULES = [
  ["NTUC FairPrice", (t) => t.has("fairprice") || (t.has("fair") && t.has("price")) || t.has("ntuc")],
  ["Cold Storage", (t) => (t.has("cold") && t.has("storage")) || (t.has("cs") && t.has("fresh"))],
  ["Sheng Siong", (t) => t.has("sheng") && (t.has("siong") || t.has("shiong"))],
  ["Giant", (t) => t.has("giant")],
  ["Prime", (t) => t.has("prime")],
  ["Don Don Donki", (t) => t.has("donki") || (t.has("don") && t.has("donki"))],
  ["Ang Mo", (t) => t.has("ang") && t.has("mo")],
  ["U Stars", (t) => t.has("stars")],
  ["Hao Mart", (t) => t.has("hao") && t.has("mart")],
  ["Scarlett", (t) => t.has("scarlett")],
];
const tokensOf = (values) =>
  new Set(values.flatMap((v) => String(v ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)));

function brandOf(tags) {
  const wikidata = BRAND_BY_WIKIDATA.get(text(tags["brand:wikidata"]) ?? "");
  if (wikidata) return wikidata;
  const tokens = tokensOf([tags.name, tags.brand, tags.operator]);
  for (const [brand, matches] of BRAND_TOKEN_RULES) if (matches(tokens)) return brand;
  return "Other";
}

// Mistagged `shop=supermarket` names that are not supermarkets. Documented,
// closed list: keep this small; legitimate grocers with odd names stay in.
const EXCLUDED_NAMES = new Set([
  "bizgram asia pte ltd", // electronics/IT store
]);

const overpass = await fetchJson(OVERPASS_URL, {
  method: "POST",
  headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    data: `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["shop"="supermarket"](area.a);out center tags;`,
  }),
});

const supermarkets = [];
const skipped = [];
for (const element of overpass.elements ?? []) {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  const tags = element.tags ?? {};
  const name = text(tags.name);
  if (!name || EXCLUDED_NAMES.has(name.toLowerCase()) || !inSingapore(lat, lng)) {
    skipped.push(name ?? "(unnamed)");
    continue;
  }
  const street = [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" ");
  const postcode = text(tags["addr:postcode"]);
  const address = street ? `${street}${postcode ? `, Singapore ${postcode}` : ""}` : postcode ? `Singapore ${postcode}` : null;
  const website = text(tags.website);
  supermarkets.push({
    id: `osm-${element.type}-${element.id}`,
    name,
    brand: brandOf(tags),
    address,
    lat: round(lat),
    lng: round(lng),
    openingHours: text(tags.opening_hours),
    website: website ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : null,
  });
}
supermarkets.sort((a, b) => a.name.localeCompare(b.name, "en-SG"));
if (supermarkets.length < 540) throw new Error(`Supermarket query returned only ${supermarkets.length} named stores`);

const serialized = JSON.stringify(supermarkets);
await mkdir("public", { recursive: true });
await writeFile("public/supermarkets.json", serialized);
const byBrand = {};
for (const s of supermarkets) byBrand[s.brand] = (byBrand[s.brand] ?? 0) + 1;
console.log(
  `Supermarket bundle: ${supermarkets.length} stores (${skipped.length} skipped; brands: ${Object.entries(byBrand).sort((a, b) => b[1] - a[1]).map(([b, n]) => `${b} ${n}`).join(", ")}), ${Buffer.byteLength(serialized)} bytes`,
);
