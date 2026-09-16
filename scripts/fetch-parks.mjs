#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Fetches the
 * Singapore Open Data NParks layers and writes the compact static map bundle.
 */
import { mkdir, writeFile } from "node:fs/promises";

const datasets = {
  tracks: "d_306cc1018cb733346681883ee6d73054",
  pcn: "d_a69ef89737379f231d2ae93fd1c5707f",
  parks: "d_77d7ec97be83d44f61b85454f844382f",
};
const endpoint = (id) => `https://api-open.data.gov.sg/v1/public/api/datasets/${id}/poll-download`;
const fetchJson = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
};
const download = async (id) => {
  const poll = await fetchJson(endpoint(id));
  const url = poll?.data?.url;
  if (!url) throw new Error(`No presigned URL returned for ${id}`);
  return fetchJson(url);
};

const sq = (x) => x * x;
function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (!dx && !dy) return Math.sqrt(sq(p[0] - a[0]) + sq(p[1] - a[1]));
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.sqrt(sq(p[0] - (a[0] + t * dx)) + sq(p[1] - (a[1] + t * dy)));
}
function simplifyLine(points, tolerance) {
  if (points.length < 3) return points;
  let max = tolerance, index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = pointSegmentDistance(points[i], points[0], points.at(-1));
    if (distance > max) { max = distance; index = i; }
  }
  if (!index) return [points[0], points.at(-1)];
  return [...simplifyLine(points.slice(0, index + 1), tolerance).slice(0, -1), ...simplifyLine(points.slice(index), tolerance)];
}
function simplifyGeometry(geometry, tolerance) {
  if (!geometry) return null;
  const map = (value) => value.map((line) => simplifyLine(line, tolerance));
  if (geometry.type === "LineString") return { ...geometry, coordinates: simplifyLine(geometry.coordinates, tolerance) };
  if (geometry.type === "MultiLineString") return { ...geometry, coordinates: map(geometry.coordinates) };
  if (geometry.type === "Polygon") return { ...geometry, coordinates: map(geometry.coordinates) };
  if (geometry.type === "MultiPolygon") return { ...geometry, coordinates: geometry.coordinates.map(map) };
  return null;
}
function nameOf(properties, fallback) {
  return String(properties?.PARK_NAME ?? properties?.park_name ?? properties?.NAME ?? properties?.name ?? properties?.PARK ?? properties?.DESCRIPTION ?? properties?.description ?? fallback ?? "Unnamed").trim() || "Unnamed";
}
function featuresOf(data) { return Array.isArray(data?.features) ? data.features : []; }
function sourceFeature(feature, kind, tolerance, properties) {
  const geometry = simplifyGeometry(feature.geometry, tolerance);
  return geometry ? { type: "Feature", geometry, properties } : null;
}

const [tracksData, pcnData, parksData] = await Promise.all(Object.values(datasets).map(download));
const tracks = featuresOf(tracksData);
const pcn = featuresOf(pcnData);
const parks = featuresOf(parksData);
if (parks.length < 100 || !parks.some((f) => ["Polygon", "MultiPolygon"].includes(f.geometry?.type))) {
  throw new Error(`Parks dataset ${datasets.parks} did not contain expected named polygons (${parks.length} features)`);
}

const thresholds = [30, 60, 100];
const tolerances = [0.0001, 0.00015, 0.0002];
let output;
for (const lengthThreshold of thresholds) for (const trailTolerance of tolerances) {
  const result = [
    ...parks.flatMap((f) => { const p = f.properties ?? {}; const item = sourceFeature(f, "park", 0.00005, { kind: "park", name: nameOf(p) }); return item ? [item] : []; }),
    ...pcn.flatMap((f) => { const p = f.properties ?? {}; const item = sourceFeature(f, "pcn", 0.00005, { kind: "pcn", name: nameOf(p, "Park Connector") }); return item ? [item] : []; }),
    ...tracks.filter((f) => { const p = f.properties ?? {}; return p.ALLOW_WALKING === "Y" && p.TYPE !== "Staircase" && Number(p["SHAPE.LEN"] ?? Infinity) >= lengthThreshold; }).flatMap((f) => { const p = f.properties ?? {}; const item = sourceFeature(f, "trail", trailTolerance, { kind: "trail", name: nameOf(p, "Walking trail"), park: nameOf({ PARK: p.PARK }, "NParks"), type: String(p.TYPE ?? "Trail"), cycle: p.ALLOW_CYCLING === "Y" }); return item ? [item] : []; }),
  ];
  output = { type: "FeatureCollection", features: result };
  const bytes = Buffer.byteLength(JSON.stringify(output));
  if (bytes <= 2_000_000) break;
}
const serialized = JSON.stringify(output);
const bytes = Buffer.byteLength(serialized);
const counts = Object.fromEntries(["park", "pcn", "trail"].map((kind) => [kind, output.features.filter((f) => f.properties.kind === kind).length]));
if (bytes > 2_000_000) throw new Error(`parks-geometry.json exceeds 2.0 MB (${bytes} bytes); breakdown ${JSON.stringify(counts)}`);
await mkdir("public", { recursive: true });
await writeFile("public/parks-geometry.json", serialized);
console.log(`Recreation bundle: ${JSON.stringify(counts)}, ${bytes} bytes`);
