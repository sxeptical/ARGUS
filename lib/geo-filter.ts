/**
 * Radius ("within N metres of a point") filtering for map data.
 *
 * Distances use a local flat projection around the filter centre, scaled by
 * the WGS84 ellipsoid's radii of curvature at the centre latitude: the
 * meridional radius M for north–south and the prime-vertical radius N for
 * east–west. A single mean-Earth radius would be ~0.5% too long north–south
 * near the equator (~28 m at 5 km); with M and N the error against an exact
 * ellipsoidal geodesic stays well under a metre for radii of a few
 * kilometres. Working in flat metres also lets lines and polygons be tested
 * with plain 2D segment geometry.
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

/**
 * World-covering polygon with the filter circle cut out, used to dim
 * everything outside the radius.
 */
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
