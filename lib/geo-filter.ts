/**
 * Radius filtering using a local flat projection scaled by the WGS84 radii
 * of curvature. This keeps errors below a metre over typical filter radii
 * while allowing simple 2D geometry checks.
 */

export type GeoFilter = {
  /** [lng, lat] */
  readonly center: readonly [number, number];
  readonly radiusM: number;
};

type LngLat = readonly [number, number];

const WGS84_A = 6_378_137;
const WGS84_E2 = 0.006_694_379_990_14;
const DEG_TO_RAD = Math.PI / 180;

export const GEO_FILTER_MIN_RADIUS_M = 250;
export const GEO_FILTER_MAX_RADIUS_M = 5_000;
export const GEO_FILTER_RADIUS_STEP_M = 250;
export const GEO_FILTER_DEFAULT_RADIUS_M = 1_000;

/** Metres per radian of longitude (east) and latitude (north) at `lat`. */
function metresPerRadian(lat: number): { east: number; north: number } {
  const phi = lat * DEG_TO_RAD;
  const w = 1 - WGS84_E2 * Math.sin(phi) ** 2;
  const primeVertical = WGS84_A / Math.sqrt(w);
  const meridional = (WGS84_A * (1 - WGS84_E2)) / w ** 1.5;
  return { east: primeVertical * Math.cos(phi), north: meridional };
}

/** Project [lng, lat] to metres east/north of `origin`. */
function toLocalMetres(origin: LngLat, [lng, lat]: LngLat): [number, number] {
  const scale = metresPerRadian(origin[1]);
  return [
    (lng - origin[0]) * DEG_TO_RAD * scale.east,
    (lat - origin[1]) * DEG_TO_RAD * scale.north,
  ];
}

/** Inverse of `toLocalMetres`. */
function fromLocalMetres(origin: LngLat, [x, y]: readonly [number, number]): [number, number] {
  const scale = metresPerRadian(origin[1]);
  return [
    origin[0] + x / scale.east / DEG_TO_RAD,
    origin[1] + y / scale.north / DEG_TO_RAD,
  ];
}

export function distanceM(from: LngLat, to: LngLat): number {
  return Math.hypot(...toLocalMetres(from, to));
}

/** Distance from the local origin (0, 0) to segment a→b, in metres. */
function originToSegmentM(a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSq));
  return Math.hypot(a[0] + t * dx, a[1] + t * dy);
}

function lineTouches(filter: GeoFilter, line: ReadonlyArray<LngLat>): boolean {
  if (line.length === 0) return false;
  const projected = line.map((point) => toLocalMetres(filter.center, point));
  if (projected.length === 1) {
    return Math.hypot(...projected[0]) <= filter.radiusM;
  }
  for (let i = 0; i < projected.length - 1; i += 1) {
    if (originToSegmentM(projected[i], projected[i + 1]) <= filter.radiusM) {
      return true;
    }
  }
  return false;
}

/** Ray-cast test: is the filter centre inside this ring? */
function centerInRing(filter: GeoFilter, ring: ReadonlyArray<LngLat>): boolean {
  const [x, y] = filter.center;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonTouches(
  filter: GeoFilter,
  rings: ReadonlyArray<ReadonlyArray<LngLat>>,
): boolean {
  if (rings.length === 0) return false;
  if (rings.some((ring) => lineTouches(filter, ring))) return true;
  // Circle entirely inside the polygon (and not inside a hole).
  return (
    centerInRing(filter, rings[0]) &&
    !rings.slice(1).some((hole) => centerInRing(filter, hole))
  );
}

export type FilterableGeometry = {
  readonly type:
    | "Point"
    | "LineString"
    | "MultiLineString"
    | "Polygon"
    | "MultiPolygon";
  readonly coordinates: unknown;
};

/** True when any part of the geometry lies within the radius. */
export function geometryTouchesRadius(
  filter: GeoFilter,
  geometry: FilterableGeometry,
): boolean {
  switch (geometry.type) {
    case "Point":
      return distanceM(filter.center, geometry.coordinates as LngLat) <= filter.radiusM;
    case "LineString":
      return lineTouches(filter, geometry.coordinates as LngLat[]);
    case "MultiLineString":
      return (geometry.coordinates as LngLat[][]).some((line) =>
        lineTouches(filter, line),
      );
    case "Polygon":
      return polygonTouches(filter, geometry.coordinates as LngLat[][]);
    case "MultiPolygon":
      return (geometry.coordinates as LngLat[][][]).some((polygon) =>
        polygonTouches(filter, polygon),
      );
  }
}

/**
 * Parameter range [t0, t1] ⊆ [0, 1] of segment a→b lying inside a circle of
 * `radiusM` around the local origin, or null when the segment stays outside.
 */
function segmentInsideRange(
  a: [number, number],
  b: [number, number],
  radiusM: number,
): [number, number] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const qa = dx * dx + dy * dy;
  const qb = 2 * (a[0] * dx + a[1] * dy);
  const qc = a[0] * a[0] + a[1] * a[1] - radiusM * radiusM;
  if (qa === 0) return qc <= 0 ? [0, 1] : null;
  const discriminant = qb * qb - 4 * qa * qc;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const t0 = Math.max(0, (-qb - root) / (2 * qa));
  const t1 = Math.min(1, (-qb + root) / (2 * qa));
  return t0 < t1 ? [t0, t1] : null;
}

/**
 * The parts of a line inside the radius, cut exactly at the circle. A line
 * that leaves and re-enters the circle yields several pieces.
 */
export function clipLineToRadius(
  filter: GeoFilter,
  line: ReadonlyArray<LngLat>,
): [number, number][][] {
  const projected = line.map((point) => toLocalMetres(filter.center, point));
  const toLngLat = (point: [number, number]) => fromLocalMetres(filter.center, point);
  const pieces: [number, number][][] = [];
  let current: [number, number][] | null = null;

  for (let i = 0; i < projected.length - 1; i += 1) {
    const a = projected[i];
    const b = projected[i + 1];
    const range = segmentInsideRange(a, b, filter.radiusM);
    if (!range) {
      current = null;
      continue;
    }
    const at = (t: number): [number, number] =>
      toLngLat([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    // Continue the open piece only when this segment starts inside the circle.
    if (!current || range[0] > 0) {
      current = [at(range[0])];
      pieces.push(current);
    }
    current.push(at(range[1]));
    if (range[1] < 1) current = null;
  }
  return pieces;
}

/** A regular polygon approximating the circle, in local metres (CCW). */
function circleRingLocal(radiusM: number, steps = 96): [number, number][] {
  const ring: [number, number][] = [];
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    ring.push([radiusM * Math.cos(angle), radiusM * Math.sin(angle)]);
  }
  return ring;
}

/** Where segment p→q crosses the infinite line a→b. */
function segmentLineIntersection(
  p: [number, number],
  q: [number, number],
  a: [number, number],
  b: [number, number],
): [number, number] {
  const rx = q[0] - p[0];
  const ry = q[1] - p[1];
  const sx = b[0] - a[0];
  const sy = b[1] - a[1];
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-12) return [...p];
  const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / denominator;
  return [p[0] + t * rx, p[1] + t * ry];
}

/** Sutherland–Hodgman clip of a ring against a convex CCW clip polygon. */
function clipRingToConvex(
  subject: [number, number][],
  clip: [number, number][],
): [number, number][] {
  let output = subject;
  for (let i = 0; i < clip.length && output.length > 0; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    const inside = (point: [number, number]) =>
      (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= 0;
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      const currentIn = inside(current);
      const previousIn = inside(previous);
      if (currentIn) {
        if (!previousIn) output.push(segmentLineIntersection(previous, current, a, b));
        output.push(current);
      } else if (previousIn) {
        output.push(segmentLineIntersection(previous, current, a, b));
      }
    }
  }
  return output;
}

/** Clip one ring to the circle, keeping the original when it is wholly inside. */
function clipRingToRadius(
  filter: GeoFilter,
  ring: ReadonlyArray<LngLat>,
  circle: [number, number][],
): [number, number][] {
  const local = ring.map((point) => toLocalMetres(filter.center, point));
  const radiusSq = filter.radiusM * filter.radiusM;
  if (local.every((point) => point[0] ** 2 + point[1] ** 2 <= radiusSq)) {
    return ring.map((point) => [...point] as [number, number]);
  }
  return clipRingToConvex(local, circle).map((point) =>
    fromLocalMetres(filter.center, point),
  );
}

/** Clip polygon rings to the circle. The first ring is the outer boundary. */
function clipPolygonRings(
  filter: GeoFilter,
  rings: ReadonlyArray<ReadonlyArray<LngLat>>,
): [number, number][][] | null {
  if (rings.length === 0) return null;
  const circle = circleRingLocal(filter.radiusM);
  const outer = clipRingToRadius(filter, rings[0], circle);
  if (outer.length < 3) return null;
  const clipped: [number, number][][] = [outer];
  for (const hole of rings.slice(1)) {
    const clippedHole = clipRingToRadius(filter, hole, circle);
    if (clippedHole.length >= 3) clipped.push(clippedHole);
  }
  return clipped;
}

/**
 * Geometry cut exactly at the radius, or null when nothing lies inside.
 * Lines may split into several pieces; polygons are clipped by a many-sided
 * circle approximation, which is what keeps fills and outlines inside too.
 */
export function clipGeometryToRadius(
  filter: GeoFilter,
  geometry: FilterableGeometry,
): FilterableGeometry | null {
  switch (geometry.type) {
    case "Point":
      return distanceM(filter.center, geometry.coordinates as LngLat) <= filter.radiusM
        ? geometry
        : null;
    case "LineString":
    case "MultiLineString": {
      const lines =
        geometry.type === "LineString"
          ? [geometry.coordinates as LngLat[]]
          : (geometry.coordinates as LngLat[][]);
      const pieces = lines.flatMap((line) => clipLineToRadius(filter, line));
      if (pieces.length === 0) return null;
      return pieces.length === 1
        ? { type: "LineString", coordinates: pieces[0] }
        : { type: "MultiLineString", coordinates: pieces };
    }
    case "Polygon": {
      const coordinates = clipPolygonRings(filter, geometry.coordinates as LngLat[][]);
      return coordinates ? { type: "Polygon", coordinates } : null;
    }
    case "MultiPolygon": {
      const polygons = (geometry.coordinates as LngLat[][][])
        .map((rings) => clipPolygonRings(filter, rings))
        .filter((value): value is [number, number][][] => value !== null);
      if (polygons.length === 0) return null;
      return polygons.length === 1
        ? { type: "Polygon", coordinates: polygons[0] }
        : { type: "MultiPolygon", coordinates: polygons };
    }
  }
}

/** Keep items whose position is within the radius; `null` filter keeps all. */
export function withinRadius<T>(
  items: T[],
  filter: GeoFilter | null,
  toLngLat: (item: T) => LngLat,
): T[] {
  if (!filter) return items;
  return items.filter((item) => {
    const point = toLngLat(item);
    return (
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]) &&
      distanceM(filter.center, point) <= filter.radiusM
    );
  });
}

/** Feature-collection variant of `withinRadius` for static GeoJSON layers. */
export function featuresTouchingRadius<
  F extends { readonly geometry: FilterableGeometry },
>(features: F[], filter: GeoFilter | null): F[] {
  if (!filter) return features;
  return features.filter((feature) =>
    geometryTouchesRadius(filter, feature.geometry),
  );
}

export type GeoFilterCircleGeoJson = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "Polygon"; coordinates: [number, number][][] };
  }>;
};

/** Closed polygon approximating the filter circle, for drawing on the map. */
export function buildGeoFilterCircleGeoJson(
  filter: GeoFilter | null,
  steps = 96,
): GeoFilterCircleGeoJson {
  if (!filter) return { type: "FeatureCollection", features: [] };
  // Inverse of `toLocalMetres`, so the drawn ring is exactly the boundary
  // the filter tests against.
  const [lng, lat] = filter.center;
  const scale = metresPerRadian(lat);
  const eastDeg = filter.radiusM / scale.east / DEG_TO_RAD;
  const northDeg = filter.radiusM / scale.north / DEG_TO_RAD;
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i += 1) {
    const theta = ((i % steps) / steps) * 2 * Math.PI;
    ring.push([
      lng + eastDeg * Math.sin(theta),
      lat + northDeg * Math.cos(theta),
    ]);
  }
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [ring] },
      },
    ],
  };
}

/** World polygon with the filter circle cut out to dim exterior areas. */
export function buildGeoFilterMaskGeoJson(
  filter: GeoFilter | null,
): GeoFilterCircleGeoJson {
  const circle = buildGeoFilterCircleGeoJson(filter).features[0];
  if (!circle) return { type: "FeatureCollection", features: [] };
  const world: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  const hole = [...circle.geometry.coordinates[0]].reverse();
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [world, hole] },
      },
    ],
  };
}

export function formatRadius(radiusM: number): string {
  return radiusM >= 1_000
    ? `${(radiusM / 1_000).toFixed(radiusM % 1_000 === 0 ? 0 : 2).replace(/0$/, "")} km`
    : `${radiusM} m`;
}
