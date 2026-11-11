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
 * then ordered whole-token-sequence matching per field on brand/name/
 * operator; everything else counts as "Other". Unnamed ways/nodes are
 * dropped. One electronics store mistagged as a supermarket (Bizgram) is
 * dropped.
 *
 * This is a separate script and output from scripts/fetch-amenities.mjs,
 * following the gyms pattern: rerunning it never refetches hawker centres,
 * malls, or their photos.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchJson, USER_AGENT } from "./lib/commons-photos.mjs";
import { hasTokenSeq, inSingapore, round, text, tokens, websiteOf } from "./lib/place-fields.mjs";

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

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

// Ordered whole-token sequences, in check order, matched against one field at
// a time (brand, then name, then operator) so tokens from unrelated fields
// never pool: a store named "Ang Mo Kio ..." cannot borrow "ang"/"mo" from a
// brand tag or operator. "Fair Price" and "CS Fresh" stay two-token
// sequences, and "stars" alone is not a brand — U Stars needs its "u". Giant,
// Prime and Scarlett are distinctive enough as single tokens.
const BRAND_TOKEN_RULES = [
  { label: "NTUC FairPrice", names: [["fairprice"], ["fair", "price"], ["ntuc"]] },
  { label: "Cold Storage", names: [["cold", "storage"], ["cs", "fresh"]] },
  { label: "Sheng Siong", names: [["sheng", "siong"], ["sheng", "shiong"]] },
  { label: "Giant", names: [["giant"]] },
  { label: "Prime", names: [["prime"]] },
  { label: "Don Don Donki", names: [["donki"]] },
  // "Ang Mo" is the chain; "Ang Mo Kio" is the town, so veto the sequence
  // when it runs into "kio" (e.g. an unbranded "Ang Mo Kio Mini Mart").
  { label: "Ang Mo", names: [["ang", "mo"]], reject: ["ang", "mo", "kio"] },
  { label: "U Stars", names: [["u", "stars"]] },
  { label: "Hao Mart", names: [["hao", "mart"]] },
  { label: "Scarlett", names: [["scarlett"]] },
];
const matchBrand = (value) => {
  const haystack = tokens(value);
  const rule = BRAND_TOKEN_RULES.find(
    ({ names, reject }) =>
      names.some((needle) => hasTokenSeq(haystack, needle)) &&
      !(reject && hasTokenSeq(haystack, reject)),
  );
  return rule?.label ?? null;
};

function brandOf(tags) {
  const wikidata = BRAND_BY_WIKIDATA.get(text(tags["brand:wikidata"]) ?? "");
  if (wikidata) return wikidata;
  return matchBrand(tags.brand) ?? matchBrand(tags.name) ?? matchBrand(tags.operator) ?? "Other";
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
  const website = websiteOf(tags.website);
  supermarkets.push({
    id: `osm-${element.type}-${element.id}`,
    name,
    brand: brandOf(tags),
    address,
    lat: round(lat),
    lng: round(lng),
    openingHours: text(tags.opening_hours),
    website,
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
