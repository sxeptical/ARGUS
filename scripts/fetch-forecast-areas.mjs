#!/usr/bin/env bun
/**
 * Authoring-time data pipeline (not run in CI or deployment). Fetches URA's
 * Master Plan 2019 Planning Area Boundary (No Sea) GeoJSON from data.gov.sg,
 * maps the 55 planning areas onto NEA's 47 two-hour forecast areas, simplifies
 * the polygons, and writes public/forecast-areas-geometry.json.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { FALLBACK_FORECAST_AREAS } from "../lib/data/forecast-areas";

const DATASET_ID = "d_4765db0e87b9c86336792efe8a1f7a66";
const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;
const SIMPLIFY_TOLERANCE = 0.0004;
const MIN_ISLET_AREA_DEG2 = 0.000001;
const MAX_BUNDLE_BYTES = 250_000;

const DIRECT_ALIASES = new Map([
  ["DOWNTOWN CORE", "City"],
  ["MARINA EAST", "City"],
  ["MARINA SOUTH", "City"],
  ["MUSEUM", "City"],
  ["NEWTON", "City"],
  ["ORCHARD", "City"],
  ["OUTRAM", "City"],
  ["RIVER VALLEY", "City"],
  ["ROCHOR", "City"],
  ["SINGAPORE RIVER", "City"],
  ["STRAITS VIEW", "City"],
  ["CHANGI BAY", "Changi"],
]);

const MULTI_ISLAND_CANDIDATES = new Map([
  ["SIMPANG", ["Sembawang", "Yishun"]],
  ["NORTH-EASTERN ISLANDS", ["Pulau Ubin", "Pulau Tekong"]],
  ["SOUTHERN ISLANDS", ["Sentosa", "Southern Islands"]],
  ["WESTERN ISLANDS", ["Jurong Island", "Western Islands"]],
]);

const AREA_BY_LOWER = new Map(
  FALLBACK_FORECAST_AREAS.map((area) => [area.name.toLowerCase(), area]),
);
const AREA_BY_NAME = new Map(
  FALLBACK_FORECAST_AREAS.map((area) => [area.name, area]),
);

const sq = (x) => x * x;

function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (!dx && !dy) return Math.sqrt(sq(p[0] - a[0]) + sq(p[1] - a[1]));
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.sqrt(sq(p[0] - (a[0] + t * dx)) + sq(p[1] - (a[1] + t * dy)));
}

function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points;
  let max = tolerance;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const dist = pointSegmentDistance(points[i], points[0], points.at(-1));
    if (dist > max) {
      max = dist;
      index = i;
    }
  }
  if (!index) return [points[0], points.at(-1)];
  return [
    ...douglasPeucker(points.slice(0, index + 1), tolerance).slice(0, -1),
    ...douglasPeucker(points.slice(index), tolerance),
  ];
}

function roundCoord(value) {
  return Math.round(value * 10_000) / 10_000;
}

function closeRing(ring) {
  if (ring.length < 3) return [];
  const first = ring[0];
  const last = ring.at(-1);
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, [first[0], first[1]]];
}

function simplifyRing(ring, tolerance) {
  const closed = closeRing(ring);
  if (closed.length < 4) return [];
  const simplified = douglasPeucker(closed, tolerance).map(([lng, lat]) => [
    roundCoord(lng),
    roundCoord(lat),
  ]);
  const deduped = simplified.filter(
    (pt, idx) => idx === 0 || pt[0] !== simplified[idx - 1][0] || pt[1] !== simplified[idx - 1][1],
  );
  const finalRing = closeRing(deduped);
  return finalRing.length >= 4 ? finalRing : [];
}

function ringAreaDeg2(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum) / 2;
}

function ringCentroid(ring) {
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let sumLng = 0;
  let sumLat = 0;
  const count = ring.length > 1 ? ring.length - 1 : ring.length;
  for (let i = 0; i < count; i += 1) {
    const [lng, lat] = ring[i];
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    sumLng += lng;
    sumLat += lat;
  }
  if (count === 0) return [0, 0];
  return [
    (sumLng / count + (minLng + maxLng) / 2) / 2,
    (sumLat / count + (minLat + maxLat) / 2) / 2,
  ];
}

function nearestCandidate([lng, lat], candidateNames) {
  let bestName = candidateNames[0];
  let bestDist = Infinity;
  for (const name of candidateNames) {
    const area = AREA_BY_NAME.get(name);
    if (!area) throw new Error(`Unknown candidate forecast area: ${name}`);
    const dist = Math.hypot(lng - area.lng, lat - area.lat);
    if (dist < bestDist) {
      bestDist = dist;
      bestName = name;
    }
  }
  return bestName;
}

/**
 * Sutherland-Hodgman half-plane clip on a closed outer ring. Keeps points where
 * `(p - origin) · normal >= 0`.
 */
function clipRingHalfPlane(ring, origin, normal) {
  const vertices =
    ring.length > 1 &&
    ring[0][0] === ring.at(-1)[0] &&
    ring[0][1] === ring.at(-1)[1]
      ? ring.slice(0, -1)
      : ring;
  if (vertices.length < 3) return [];

  const signedDist = (p) =>
    (p[0] - origin[0]) * normal[0] + (p[1] - origin[1]) * normal[1];

  const intersect = (a, b, da, db) => {
    const denom = da - db;
    if (Math.abs(denom) < 1e-12) return a;
    const t = da / denom;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };

  const out = [];
  for (let i = 0; i < vertices.length; i += 1) {
    const curr = vertices[i];
    const prev = vertices[(i + vertices.length - 1) % vertices.length];
    const dCurr = signedDist(curr);
    const dPrev = signedDist(prev);
    const inCurr = dCurr >= 0;
    const inPrev = dPrev >= 0;

    if (inCurr) {
      if (!inPrev) out.push(intersect(prev, curr, dPrev, dCurr));
      out.push(curr);
    } else if (inPrev) {
      out.push(intersect(prev, curr, dPrev, dCurr));
    }
  }

  return closeRing(out);
}

function planningNameOf(feature) {
  const props = feature.properties ?? {};
  if (typeof props.PLN_AREA_N === "string" && props.PLN_AREA_N.trim()) {
    return props.PLN_AREA_N.trim().toUpperCase();
  }
  const desc = String(props.Description ?? "");
  const match = desc.match(/PLN_AREA_N<\/th>\s*<td>([^<]+)/i);
  if (match?.[1]) return match[1].trim().toUpperCase();
  return String(props.Name ?? "").trim().toUpperCase();
}

function outerRingsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((poly) => (poly[0] ? [poly[0]] : []));
  }
  return [];
}

const pollRes = await fetch(POLL_URL, { signal: AbortSignal.timeout(60_000) });
if (!pollRes.ok) throw new Error(`Poll failed: ${pollRes.status}`);
const pollJson = await pollRes.json();
const downloadUrl = pollJson?.data?.url;
if (!downloadUrl) throw new Error("No presigned URL returned for URA dataset");

const dataRes = await fetch(downloadUrl, { signal: AbortSignal.timeout(120_000) });
if (!dataRes.ok) throw new Error(`Download failed: ${dataRes.status}`);
const rawGeoJson = await dataRes.json();

const buckets = new Map(FALLBACK_FORECAST_AREAS.map((area) => [area.name, []]));

const wwcPoint = AREA_BY_NAME.get("Western Water Catchment");
const jalanBaharPoint = AREA_BY_NAME.get("Jalan Bahar");
if (!wwcPoint || !jalanBaharPoint) {
  throw new Error("Missing Western Water Catchment or Jalan Bahar anchor");
}
const splitMid = [
  (wwcPoint.lng + jalanBaharPoint.lng) / 2,
  (wwcPoint.lat + jalanBaharPoint.lat) / 2,
];
const normalToWwc = [
  wwcPoint.lng - jalanBaharPoint.lng,
  wwcPoint.lat - jalanBaharPoint.lat,
];
const normalToJalanBahar = [-normalToWwc[0], -normalToWwc[1]];

for (const feature of rawGeoJson.features ?? []) {
  const plnName = planningNameOf(feature);
  const outerRings = outerRingsOf(feature.geometry);
  if (!plnName || outerRings.length === 0) continue;

  if (plnName === "WESTERN WATER CATCHMENT") {
    for (const ring of outerRings) {
      const northClip = clipRingHalfPlane(ring, splitMid, normalToWwc);
      const southClip = clipRingHalfPlane(ring, splitMid, normalToJalanBahar);
      if (northClip.length >= 4) buckets.get("Western Water Catchment").push(northClip);
      if (southClip.length >= 4) buckets.get("Jalan Bahar").push(southClip);
    }
    continue;
  }

  const multiCandidates = MULTI_ISLAND_CANDIDATES.get(plnName);
  if (multiCandidates) {
    for (const ring of outerRings) {
      const target = nearestCandidate(ringCentroid(ring), multiCandidates);
      buckets.get(target).push(ring);
    }
    continue;
  }

  const directName =
    DIRECT_ALIASES.get(plnName) ?? AREA_BY_LOWER.get(plnName.toLowerCase())?.name;
  if (!directName) {
    throw new Error(`Unmapped URA planning area: ${plnName}`);
  }
  for (const ring of outerRings) {
    buckets.get(directName).push(ring);
  }
}

const features = [];
for (const area of FALLBACK_FORECAST_AREAS) {
  const rawRings = buckets.get(area.name) ?? [];
  const simplifiedRings = rawRings
    .map((ring) => simplifyRing(ring, SIMPLIFY_TOLERANCE))
    .filter((ring) => ring.length >= 4)
    .sort((a, b) => ringAreaDeg2(b) - ringAreaDeg2(a));

  if (simplifiedRings.length === 0) {
    throw new Error(`No polygon rings generated for NEA area "${area.name}"`);
  }

  const keptRings = simplifiedRings.filter(
    (ring, index) => index === 0 || ringAreaDeg2(ring) >= MIN_ISLET_AREA_DEG2,
  );

  const geometry =
    keptRings.length === 1
      ? { type: "Polygon", coordinates: [keptRings[0]] }
      : { type: "MultiPolygon", coordinates: keptRings.map((ring) => [ring]) };

  features.push({
    type: "Feature",
    properties: { name: area.name },
    geometry,
  });
}

if (features.length !== FALLBACK_FORECAST_AREAS.length) {
  throw new Error(
    `Expected ${FALLBACK_FORECAST_AREAS.length} features, got ${features.length}`,
  );
}

const output = { type: "FeatureCollection", features };
const serialized = JSON.stringify(output);
const bytes = Buffer.byteLength(serialized);
if (bytes >= MAX_BUNDLE_BYTES) {
  throw new Error(
    `forecast-areas-geometry.json (${bytes} bytes) exceeds ${MAX_BUNDLE_BYTES} bytes`,
  );
}

await mkdir("public", { recursive: true });
await writeFile("public/forecast-areas-geometry.json", serialized);
console.log(`Forecast areas bundle: ${features.length} areas, ${bytes} bytes`);
