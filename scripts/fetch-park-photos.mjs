#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the
 * park photo bundle (display park name → credited photos) from Wikimedia
 * Commons: each park's Wikidata item where the names match, then a title
 * search for bigger parks still short of photos. Small playgrounds and
 * pocket parks are left without photos.
 *
 * Pass a path to also write a review list of the chosen files.
 */
import { readFile, writeFile } from "node:fs/promises";
import { areaHectares, formatParkName, parkLabelPoint } from "../lib/parks.ts";
import {
  commonsQuery,
  fetchCommonsPhotos,
  fetchWikidataItems,
  isPhotoFile,
  MAX_PHOTOS_PER_PLACE,
  pickPhotos,
  resolvePhotoInfo,
} from "./lib/commons-photos.mjs";

// Wikidata classes: park, nature reserve, garden, botanical garden.
const WIKIDATA_PARK_CLASSES = ["Q22698", "Q179049", "Q1107656", "Q167346"];
const SEARCH_MIN_HECTARES = 10;
// Same name but too far away is a different place (~6.5km allows for huge reserves).
const MAX_ITEM_DISTANCE_DEG = 0.06;

/** NParks splits some parks into sections; those share one set of photos. */
const baseParkName = (name) => {
  if (name.startsWith("SBG ")) return "Singapore Botanic Gardens";
  if (name === "JLG: Lakeside Garden") return "Lakeside Garden";
  if (name === "Pulau Ubin and Chek Jawa") return "Pulau Ubin";
  return name
    .replace(/\s*\(.*$/, "")
    .replace(/\s+Area\s+[A-Z]$/, "")
    .replace(/\s+[A-Z]$/, "")
    .trim();
};

// Commons titles often omit the "Park" that NParks names carry.
const SEARCH_ALIASES = {
  "Clementi Woods Park": ["Clementi Woods"],
  "Coney Island Park": ["Coney Island"],
  // "Lakeside Garden" alone also finds places abroad.
  "Lakeside Garden": ["Jurong Lake Gardens"],
  "Lower Peirce Reservoir Park": ["Lower Peirce Reservoir"],
  "Macritchie Reservoir Park": ["MacRitchie Reservoir"],
  "Pulau Ubin": ["Pulau Ubin", "Chek Jawa"],
  "Sisters' Island Marine Park": ["Sisters Islands", "Sisters' Islands"],
  "Tampines Eco Green Park": ["Tampines Eco Green"],
  "Upper Seletar Reservoir Park": ["Upper Seletar Reservoir"],
};

// Found by reviewing the output: files showing somewhere else, and a park
// whose only Commons photos are of the sports complex sharing its name.
const EXCLUDED_FILES = ["ChineseGardenSingapore-bridge-pagoda-20080501.jpg", "Former_Merlion_Park.JPG"];
const EXCLUDED_PARKS = new Set(["Bukit Canberra"]);
const isExcludedPhoto = (photo) => EXCLUDED_FILES.some((file) => photo.page.endsWith(`File:${file}`));

const matchKey = (name) =>
  name.toLowerCase().replace(/\b(?:park|parks|nature|reserve|garden|gardens|hill|the|singapore|national)\b/g, "").replace(/[^a-z0-9]/g, "");
const phrase = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const geometry = JSON.parse(await readFile("public/parks-geometry.json", "utf8"));
const groups = new Map();
for (const feature of geometry.features) {
  if (feature.properties.kind !== "park") continue;
  const name = formatParkName(feature.properties.name);
  const base = baseParkName(name);
  const group = groups.get(base) ?? { id: base, name: base, parks: [], areaHa: 0, point: null };
  group.parks.push(name);
  const areaHa = areaHectares(feature.geometry);
  if (!group.point || areaHa > group.largestHa) {
    group.point = parkLabelPoint(feature.geometry);
    group.largestHa = areaHa;
  }
  group.areaHa += areaHa;
  groups.set(base, group);
}

const items = new Map();
for (const classId of WIKIDATA_PARK_CLASSES) {
  for (const [id, item] of await fetchWikidataItems(classId)) items.set(id, item);
}
const withPhotos = [...items.values()].filter((item) => item.images.size || item.category);
const itemFor = (group) => {
  const key = matchKey(group.name);
  if (!key) return undefined;
  return withPhotos.find((item) => {
    if (matchKey(item.label) !== key) return false;
    return item.lat === null || !group.point || Math.hypot(item.lat - group.point[1], item.lng - group.point[0]) < MAX_ITEM_DISTANCE_DEG;
  });
};
const places = [...groups.values()].filter((group) => !EXCLUDED_PARKS.has(group.name));
const photosByGroup = new Map(
  [...(await fetchCommonsPhotos(places, itemFor))].map(([id, photos]) => [id, photos.filter((photo) => !isExcludedPhoto(photo))]),
);
const sources = new Map([...photosByGroup].filter(([, photos]) => photos.length).map(([id]) => [id, "wikidata"]));

// Top up bigger parks by file title. Requiring the whole name in the title
// keeps out neighbours ("Punggol Waterway" for Punggol Park), and connectors
// are their own thing ("Marsiling Park Connector" for Marsiling Park). Asking
// for "Singapore" keeps out same-named places abroad, but many Singapore files
// never say it, so unusual full names get a second try without it.
const searchFileTitles = async (term) => {
  const matching = (found) =>
    (found?.query?.search ?? [])
      .map((hit) => hit.title)
      .filter((title) => isPhotoFile(title) && phrase(title).includes(phrase(term)) && !/park connector/i.test(title));
  const search = (srsearch) => commonsQuery({ action: "query", list: "search", srnamespace: "6", srlimit: "15", srsearch });
  const inSingapore = matching(await search(`intitle:"${term}" Singapore filetype:bitmap`));
  return inSingapore.length ? inSingapore : matching(await search(`intitle:"${term}" filetype:bitmap`));
};
const searchTitles = new Map();
for (const group of places) {
  if (group.areaHa < SEARCH_MIN_HECTARES || (photosByGroup.get(group.id)?.length ?? 0) >= MAX_PHOTOS_PER_PLACE) continue;
  const titles = [];
  for (const term of SEARCH_ALIASES[group.name] ?? [group.name]) {
    titles.push(...(await searchFileTitles(term)));
  }
  if (titles.length) searchTitles.set(group.id, titles);
}
const searchInfo = await resolvePhotoInfo([...searchTitles.values()].flat());
for (const [id, titles] of searchTitles) {
  const existing = photosByGroup.get(id) ?? [];
  const seen = new Set(existing.map((photo) => photo.thumb));
  const extra = pickPhotos(titles, searchInfo).filter((photo) => !seen.has(photo.thumb));
  const merged = [...existing, ...extra].slice(0, MAX_PHOTOS_PER_PLACE);
  if (merged.length) {
    photosByGroup.set(id, merged);
    sources.set(id, existing.length ? "wikidata+search" : "search");
  }
}

const bundle = {};
for (const group of places.toSorted((a, b) => a.name.localeCompare(b.name, "en-SG"))) {
  const photos = photosByGroup.get(group.id) ?? [];
  if (!photos.length) continue;
  for (const name of group.parks.toSorted()) bundle[name] = photos;
}
const serialized = JSON.stringify(bundle);
await writeFile("public/park-photos.json", serialized);

const withAny = places.filter((group) => photosByGroup.get(group.id)?.length);
const big = places.filter((group) => group.areaHa >= SEARCH_MIN_HECTARES);
console.log(
  `Park photos: ${Object.keys(bundle).length} of ${geometry.features.filter((f) => f.properties.kind === "park").length} park areas ` +
    `(${withAny.length} parks; ${big.filter((group) => photosByGroup.get(group.id)?.length).length} of ${big.length} parks over ${SEARCH_MIN_HECTARES} ha), ` +
    `${Buffer.byteLength(serialized)} bytes`,
);

const reviewPath = process.argv[2];
if (reviewPath) {
  const lines = places.toSorted((a, b) => b.areaHa - a.areaHa).map((group) => {
    const photos = photosByGroup.get(group.id) ?? [];
    const files = photos.map((photo) => decodeURIComponent(photo.page.split("File:")[1] ?? photo.thumb)).join(" | ");
    return `${Math.round(group.areaHa)} ha\t${group.name}\t${sources.get(group.id) ?? "-"}\t${files}`;
  });
  await writeFile(reviewPath, `${lines.join("\n")}\n`);
}
