/**
 * Copies MapLibre's ESM worker and shared chunk into public/ before dev/build.
 * Serving them directly avoids bundler resolution failures for the shared chunk.
 * app/components/Map.tsx points setWorkerUrl() at the copied worker.
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
