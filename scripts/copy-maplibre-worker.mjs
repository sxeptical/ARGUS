/**
 * Copies the maplibre-gl v6 ESM worker and its shared chunk into public/.
 *
 * maplibre-gl v6 is ESM-only and loads its worker from a URL. Bundlers
 * (including Next.js in both Turbopack and webpack mode) cannot reliably
 * resolve the worker's `maplibre-gl-shared.mjs` sibling when it is emitted
 * through the module graph, so the worker fails on its first import and the
 * map mounts but never loads a tile. Serving both files from public/ and
 * pointing setWorkerUrl() at them (see app/components/Map.tsx) avoids that.
 *
 * Run automatically via the predev/prebuild lifecycle hooks. The copy happens
 * from node_modules at build time so the files always match the installed
 * version.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const distDir = path.join(
  path.dirname(require.resolve("maplibre-gl/package.json")),
  "dist",
);
const destDir = path.join(process.cwd(), "public", "maplibre");

mkdirSync(destDir, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(path.join(distDir, file), path.join(destDir, file));
}
console.log(`Copied maplibre-gl worker files to ${destDir}`);
