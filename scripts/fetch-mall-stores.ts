#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Builds the mall
 * store directories from curioputterings/singapore-mall-data (CC BY 4.0):
 * `stores.json` is scraped from each mall operator's own site, so treat it as
 * "as listed by the operator" at fetch time, not live.
 *
 * Reads the malls already in public/amenities.json (run
 * scripts/fetch-amenities.mjs first if that changes) and writes:
 *  - public/mall-stores/<mallId>.json: that mall's cleaned store list
 *  - public/mall-stores/index.json: which malls have one, loaded with the app
 * Descriptions are dropped to keep the files small.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { cleanStoreRow, compareStores, matchStoreListMall, type CuratedMall, type RawStoreRow } from "@/lib/mall-stores";
import type { AmenitiesBundle, MallStore, MallStoreIndex } from "@/types";

const DATA_BASE_URL = "https://raw.githubusercontent.com/curioputterings/singapore-mall-data/HEAD/shopping/data";
const OUT_DIR = "public/mall-stores";

// Store-list mall names the matcher can't place on its own → map mall name.
// Lists whose mall isn't on the map (PLQ Mall, Far East Square, Lucky
// Chinatown, Riverside Point) are skipped and reported.
const ALIASES: Record<string, string> = {
  "Swing By @ Thomson Plaza": "Thomson Plaza",
  "Jewel Changi Airport": "Jewel Changi Basement",
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return (await response.json()) as T;
};

const { malls } = JSON.parse(await readFile("public/amenities.json", "utf8")) as AmenitiesBundle;
const [curated, rows] = await Promise.all([
  fetchJson<CuratedMall[]>(`${DATA_BASE_URL}/malls.json`),
  fetchJson<(RawStoreRow & { mall: string })[]>(`${DATA_BASE_URL}/stores.json`),
]);

const rowsByList = new Map<string, RawStoreRow[]>();
for (const row of rows) {
  if (typeof row.mall !== "string") continue;
  rowsByList.set(row.mall, [...(rowsByList.get(row.mall) ?? []), row]);
}

const index: MallStoreIndex = { fetchedAt: new Date().toISOString().slice(0, 10), malls: {} };
const files = new Map<string, MallStore[]>();
const skipped: string[] = [];
for (const [listName, listRows] of [...rowsByList].sort(([a], [b]) => a.localeCompare(b))) {
  const mall = matchStoreListMall(listName, malls, curated, ALIASES);
  if (!mall) {
    skipped.push(`${listName} (no map mall)`);
    continue;
  }
  if (index.malls[mall.id]) {
    skipped.push(`${listName} (map mall ${mall.name} already has ${index.malls[mall.id].listName})`);
    continue;
  }
  // Some operators list a shop once per unit or entrance: keep one per name + unit.
  const seen = new Set<string>();
  const stores = listRows
    .map(cleanStoreRow)
    .filter((store): store is MallStore => store !== null)
    .filter((store) => {
      const key = `${store.name.toLowerCase()}|${store.unit ?? ""}`;
      return !seen.has(key) && Boolean(seen.add(key));
    })
    .sort(compareStores);
  if (!stores.length) continue;
  files.set(mall.id, stores);
  index.malls[mall.id] = { stores: stores.length, listName };
}
if (files.size < 40) throw new Error(`Only ${files.size} store lists matched map malls`);

await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });
let bytes = 0;
for (const [mallId, stores] of files) {
  const serialized = JSON.stringify(stores);
  bytes += Buffer.byteLength(serialized);
  await writeFile(`${OUT_DIR}/${mallId}.json`, serialized);
}
await writeFile(`${OUT_DIR}/index.json`, `${JSON.stringify(index, null, 2)}\n`);

const total = [...files.values()].reduce((sum, stores) => sum + stores.length, 0);
const levelled = [...files.values()].flat().filter((store) => store.level !== null).length;
console.log(
  `Mall stores: ${total} stores in ${files.size} malls (${levelled} with a level), ${bytes} bytes; ` +
    `skipped ${skipped.length} list(s)${skipped.length ? `:\n  - ${skipped.join("\n  - ")}` : ""}`,
);
