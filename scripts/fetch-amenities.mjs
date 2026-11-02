#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * static amenities bundle from:
 *  - NEA hawker centres (Singapore Open Data, data.gov.sg)
 *  - OpenStreetMap `shop=mall` (Overpass API, ODbL) for mall locations,
 *    enriched with shop counts / nearest MRT from
 *    curioputterings/singapore-mall-data (CC BY 4.0) where a mall matches.
 *  - Mall and hawker centre photos from Wikimedia Commons (per-file free
 *    licences, credited in the bundle), found via each place's Wikidata item.
 *    Hawker centres without Commons photos fall back to NEA's own photo.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchCommonsPhotos, fetchJson, fetchWikidataItems, USER_AGENT } from "./lib/commons-photos.mjs";

const HAWKER_DATASET = "d_4a086da0a5553be1d89383cd90d07ecd";
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const CURATED_MALLS_URL =
  "https://raw.githubusercontent.com/curioputterings/singapore-mall-data/HEAD/shopping/data/malls.json";
// Wikidata classes: shopping center, hawker center.
const WIKIDATA_MALL_CLASS = "Q11315";
const WIKIDATA_HAWKER_CLASS = "Q863425";
// NEA's photo links are http:// on its own site; the same paths serve over https.
const NEA_PHOTO_URL_RE = /^https?:\/\/www\.nea\.gov\.sg\/.+\.(?:jpe?g|png)$/i;
const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
const round = (value) => Math.round(value * 1e6) / 1e6;
const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

async function fetchHawkers() {
  const poll = await fetchJson(`https://api-open.data.gov.sg/v1/public/api/datasets/${HAWKER_DATASET}/poll-download`);
  const url = poll?.data?.url;
  if (!url) throw new Error(`No presigned URL returned for ${HAWKER_DATASET}`);
  const data = await fetchJson(url);
  const neaPhotos = new Map();
  const hawkers = (data?.features ?? []).flatMap((feature) => {
    const p = feature.properties ?? {};
    const [lng, lat] = feature.geometry?.coordinates ?? [];
    const name = text(p.NAME);
    if (!name || !inSingapore(lat, lng)) return [];
    const planned = String(p.STATUS ?? "").toLowerCase().startsWith("under construction");
    const year = /^(\d{4})/.exec(String(p.EST_ORIGINAL_COMPLETION_DATE ?? ""))?.[1];
    const stalls = Number(p.NUMBER_OF_COOKED_FOOD_STALLS);
    const id = `hawker-${p.OBJECTID}`;
    if (NEA_PHOTO_URL_RE.test(p.PHOTOURL ?? "")) neaPhotos.set(id, p.PHOTOURL.replace(/^http:/, "https:"));
    return [{
      id,
      name,
      address: text(p.ADDRESS_MYENV),
      lat: round(lat),
      lng: round(lng),
      stalls: Number.isFinite(stalls) && stalls > 0 ? stalls : null,
      status: planned ? "planned" : "open",
      expectedYear: planned && year ? Number(year) : null,
    }];
  });
  if (hawkers.length < 100) throw new Error(`Hawker dataset returned only ${hawkers.length} centres`);
  return { hawkers: hawkers.sort((a, b) => a.name.localeCompare(b.name, "en-SG")), neaPhotos };
}

const normalizeName = (name) =>
  name.toLowerCase().replace(/&/g, "and").replace(/\bsingapore\b/g, "").replace(/[^a-z0-9]/g, "");

async function fetchMalls() {
  const query = `[out:json][timeout:90];area["ISO3166-1"="SG"]->.a;nwr["shop"="mall"]["name"](area.a);out center tags;`;
  const osm = await fetchJson(OVERPASS_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: query }),
  });
  const curated = await fetchJson(CURATED_MALLS_URL);
  const curatedByPostcode = new Map(curated.filter((m) => m.postal_code).map((m) => [String(m.postal_code), m]));
  const curatedByName = new Map(curated.map((m) => [normalizeName(m.mall_name), m]));
  const matched = new Set();

  const enrich = (mall, info) => {
    if (!info) return mall;
    matched.add(info);
    const stores = info.has_store_data && info.num_stores > 0 ? info.num_stores : null;
    return {
      ...mall,
      address: mall.address ?? text(info.address),
      stores,
      fnb: stores !== null && info.num_fnb > 0 ? info.num_fnb : null,
      nearestMrt: text(info.nearest_mrt),
    };
  };

  // OSM (and the curated list) map some malls more than once: building +
  // node, split wings, or a renamed duplicate on the same footprint. Keep the
  // first per normalized name within ~500m, and the first at any one spot.
  const malls = [];
  const wikidataIds = new Map();
  const isDuplicate = (name, lat, lng) =>
    malls.some((m) => {
      const distance = Math.hypot(m.lat - lat, m.lng - lng);
      return distance < 0.0003 || (normalizeName(m.name) === normalizeName(name) && distance < 0.0045);
    });
  const elements = [...(osm?.elements ?? [])].sort((a, b) => (a.type === "node") - (b.type === "node"));
  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = text(tags.name);
    const lat = element.lat ?? element.center?.lat;
    const lng = element.lon ?? element.center?.lon;
    if (!name || !inSingapore(lat, lng)) continue;
    if (isDuplicate(name, lat, lng)) continue;
    const key = normalizeName(name);
    const street = [text(tags["addr:housenumber"]), text(tags["addr:street"])].filter(Boolean).join(" ");
    const postcode = text(tags["addr:postcode"]);
    const base = {
      id: `osm-${element.type}-${element.id}`,
      name,
      address: street ? `${street}${postcode ? `, Singapore ${postcode}` : ""}` : null,
      lat: round(lat),
      lng: round(lng),
      openingHours: text(tags.opening_hours),
      stores: null,
      fnb: null,
      nearestMrt: null,
    };
    malls.push(enrich(base, (postcode && curatedByPostcode.get(postcode)) || curatedByName.get(key)));
    if (/^Q\d+$/.test(tags.wikidata ?? "")) wikidataIds.set(base.id, tags.wikidata);
  }

  // Curated malls OSM doesn't tag as shop=mall, where the dataset has coordinates.
  for (const info of curated) {
    if (matched.has(info)) continue;
    const lat = Number(info.latitude);
    const lng = Number(info.longitude);
    if (!info.latitude || !inSingapore(lat, lng) || isDuplicate(info.mall_name, lat, lng)) continue;
    malls.push(enrich({
      id: `curated-${normalizeName(info.mall_name)}`,
      name: info.mall_name,
      address: null,
      lat: round(lat),
      lng: round(lng),
      openingHours: null,
      stores: null,
      fnb: null,
      nearestMrt: null,
    }, info));
  }
  if (malls.length < 150) throw new Error(`Mall sources returned only ${malls.length} malls`);
  return { malls: malls.sort((a, b) => a.name.localeCompare(b.name, "en-SG")), enriched: matched.size, wikidataIds };
}

// ---------- Mall photos (Wikidata → Wikimedia Commons) ----------

const distance = (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng);

async function fetchMallPhotos(malls, wikidataIds) {
  const items = await fetchWikidataItems(WIKIDATA_MALL_CLASS);
  const located = [...items.values()].filter((item) => item.lat !== null);
  // OSM's wikidata tag first; otherwise the same normalized name within ~650m.
  return fetchCommonsPhotos(malls, (mall) =>
    items.get(wikidataIds.get(mall.id)) ??
    located.find((item) => normalizeName(item.label) === normalizeName(mall.name) && distance(item, mall) < 0.006));
}

// Hawker names differ between NEA and Wikidata ("Adam Road Food Centre" vs
// "Adam Food Centre"), so compare on the distinctive words only.
const hawkerKey = (name) =>
  normalizeName(name.replace(/\b(?:hawker|food|market|centre|center|cooked|village|complex|and|blk|block)\b/gi, " "));

async function fetchHawkerPhotos(hawkers, neaPhotos) {
  const items = await fetchWikidataItems(WIKIDATA_HAWKER_CLASS);
  const located = [...items.values()].filter((item) => item.lat !== null);
  // Same distinctive name within ~650m; else the only item within ~110m.
  // Centres still under construction have no photos of their own yet.
  const matchFor = (hawker) => {
    if (hawker.status === "planned") return undefined;
    const byName = located.find((item) => hawkerKey(item.label) && hawkerKey(item.label) === hawkerKey(hawker.name) && distance(item, hawker) < 0.006);
    if (byName) return byName;
    const near = located.filter((item) => distance(item, hawker) < 0.001);
    return near.length === 1 ? near[0] : undefined;
  };
  // One Wikidata item describes one building: give it to the closest centre.
  const owner = new Map();
  for (const hawker of hawkers) {
    const item = matchFor(hawker);
    if (item && (!owner.has(item.id) || distance(item, hawker) < distance(item, owner.get(item.id)))) owner.set(item.id, hawker);
  }
  const commons = await fetchCommonsPhotos(hawkers, (hawker) => {
    const item = matchFor(hawker);
    return item && owner.get(item.id) === hawker ? item : undefined;
  });
  const nea = (id) => (neaPhotos.has(id) ? [{ thumb: neaPhotos.get(id), page: null, author: "NEA", license: null, source: "nea" }] : []);
  return new Map(hawkers.map((hawker) => {
    const photos = commons.get(hawker.id) ?? [];
    return [hawker.id, photos.length ? photos : nea(hawker.id)];
  }));
}

const [hawkerResult, mallResult] = await Promise.all([fetchHawkers(), fetchMalls()]);
const { enriched } = mallResult;
// Commons requests are paced one at a time, so run these sequentially.
const mallPhotos = await fetchMallPhotos(mallResult.malls, mallResult.wikidataIds);
const hawkerPhotos = await fetchHawkerPhotos(hawkerResult.hawkers, hawkerResult.neaPhotos);
const malls = mallResult.malls.map((mall) => ({ ...mall, photos: mallPhotos.get(mall.id) ?? [] }));
const hawkers = hawkerResult.hawkers.map((hawker) => ({ ...hawker, photos: hawkerPhotos.get(hawker.id) ?? [] }));
const withPhotos = (places, source) => places.filter((place) => place.photos.some((photo) => photo.source === source)).length;
const serialized = JSON.stringify({ hawkers, malls });
await mkdir("public", { recursive: true });
await writeFile("public/amenities.json", serialized);
console.log(
  `Amenities bundle: ${hawkers.length} hawker centres (${hawkers.filter((h) => h.status === "planned").length} planned; ` +
    `photos: ${withPhotos(hawkers, "commons")} Commons, ${withPhotos(hawkers, "nea")} NEA), ` +
    `${malls.length} malls (${enriched} enriched with shop data, ${withPhotos(malls, "commons")} with photos), ${Buffer.byteLength(serialized)} bytes`,
);
