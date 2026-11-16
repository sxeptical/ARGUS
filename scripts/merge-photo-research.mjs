#!/usr/bin/env bun
/**
 * Authoring-time: fold hand-research results (.photo-research/results/*.json,
 * see .photo-research/INSTRUCTIONS.md) into scripts/data/photo-picks.json.
 * Every file title is re-checked against Commons with the same licence,
 * format and size rules the bundles use, so a typo or a non-free
 * file never lands. A file claimed by two places in one layer is dropped
 * from both and reported for a human to settle, unless every claimant
 * lists it in its entry's `shared` (a reviewer's "this photo shows both":
 * one building under two records, or two hotels side by side). Existing picks are kept
 * unless a result replaces that place's entry. Then run
 * `bun scripts/apply-photo-picks.mjs`.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { ARCHIVAL_PHOTO_OPTIONS, resolvePhotoInfo } from "./lib/commons-photos.mjs";
import { loadPhotoPicks } from "./lib/photo-picks.mjs";

const RESULTS_DIR = ".photo-research/results";
const PICKS_PATH = "scripts/data/photo-picks.json";
const PHOTO_OPTIONS = { heritage: ARCHIVAL_PHOTO_OPTIONS };

const results = [];
for (const file of (await readdir(RESULTS_DIR)).filter((name) => name.endsWith(".json")).sort()) {
  const batch = JSON.parse(await readFile(`${RESULTS_DIR}/${file}`, "utf8"));
  for (const [id, entry] of Object.entries(batch)) {
    if (!entry?.layer || !Array.isArray(entry.files)) throw new Error(`${file}: malformed entry ${id}`);
    const files = [...new Set(entry.files.map((title) => String(title).replace(/_/g, " ").trim()))].filter(Boolean);
    const shared = new Set((entry.shared ?? []).map((title) => String(title).replace(/_/g, " ").trim()));
    if (files.length) results.push({ batch: file, id, layer: entry.layer, name: entry.name, files, shared, note: entry.evidence });
  }
}

const picks = await loadPhotoPicks();
const rejected = [];
for (const layer of new Set(results.map((result) => result.layer))) {
  const layerResults = results.filter((result) => result.layer === layer);
  const info = await resolvePhotoInfo(layerResults.flatMap((result) => result.files), PHOTO_OPTIONS[layer]);
  const claims = new Map();
  for (const result of layerResults) for (const title of result.files) claims.set(title, [...(claims.get(title) ?? []), result]);
  for (const result of layerResults) {
    const files = result.files.filter((title) => {
      const claimants = claims.get(title);
      const contested = claimants.length > 1 && !claimants.every((claimant) => claimant.shared.has(title));
      // No isPhotoFile title filter: that guards automated category crawls,
      // while a researched pick may rightly be, say, a historic site's marker.
      const reason = !info.has(title) ? "missing, non-free, non-JPEG or too small"
        : contested ? `also claimed by ${claimants.filter((claimant) => claimant !== result).map((claimant) => claimant.name).join(", ")}` : null;
      if (reason) rejected.push(`${layer}/${result.name}: ${title} (${reason})`);
      return !reason;
    });
    if (!files.length) continue;
    picks[layer] ??= {};
    picks[layer][result.id] = { name: result.name, files, ...(result.note ? { note: result.note } : {}) };
  }
}

// Stable output: layers and place ids sorted, so diffs stay reviewable.
const sorted = Object.fromEntries(
  Object.keys(picks).sort().map((layer) => [layer, Object.fromEntries(Object.entries(picks[layer]).sort(([a], [b]) => a.localeCompare(b)))]),
);
await mkdir("scripts/data", { recursive: true });
await writeFile(PICKS_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
for (const line of rejected) console.log(`rejected ${line}`);
console.log(
  `Photo picks: ${Object.entries(sorted).map(([layer, entries]) => `${layer} ${Object.keys(entries).length}`).join(", ")} ` +
    `(${rejected.length} files rejected)`,
);
