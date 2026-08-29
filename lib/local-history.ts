/**
 * localStorage-backed history primitives shared by the weather and bus
 * arrival histories.
 *
 * The read/write/validate pattern was previously duplicated (and buggy):
 * both features hydrated persisted state with a `setTimeout` after network
 * data could already have been recorded, so a remount could overwrite
 * stored history with a one-point list. The helpers here use merge
 * semantics instead — hydration unions persisted points with anything
 * already recorded, by timestamp — so ordering no longer matters.
 *
 * Every store is bounded in two dimensions: points per series and total
 * series, so a long-lived browser cannot grow localStorage unboundedly.
 */

export type TimestampedPoint = { readonly timestamp: string };

// ---------- JSON storage primitives ----------

export function readStoredJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    // Corrupted or unavailable storage is not fatal: callers treat it as
    // "no history yet".
    return null;
  }
}

export function writeStoredJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / private-browsing failures; the live dashboard keeps
    // working with in-memory history only.
  }
}

// ---------- Point list helpers ----------

function byTimestamp(a: TimestampedPoint, b: TimestampedPoint): number {
  return Date.parse(a.timestamp) - Date.parse(b.timestamp);
}

/** Union of two point lists; on a shared timestamp the right-hand wins. */
export function mergePointLists<T extends TimestampedPoint>(
  persisted: readonly T[],
  current: readonly T[],
): T[] {
  if (persisted.length === 0) return [...current];
  if (current.length === 0) return [...persisted];
  const merged = new Map<string, T>();
  for (const point of persisted) merged.set(point.timestamp, point);
  for (const point of current) merged.set(point.timestamp, point);
  return [...merged.values()].sort(byTimestamp);
}

export function readPointList<T extends TimestampedPoint>(
  key: string,
  validate: (value: unknown) => value is T,
  maxPoints: number,
): T[] {
  const parsed = readStoredJson(key);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(validate)
    .sort(byTimestamp)
    .slice(-maxPoints);
}

export function writePointList<T extends TimestampedPoint>(
  key: string,
  points: readonly T[],
  maxPoints: number,
): void {
  writeStoredJson(key, points.slice(-maxPoints));
}

// ---------- Keyed stores of point lists ----------

export type PointStore<T extends TimestampedPoint> = Readonly<
  Record<string, readonly T[]>
>;

export function readPointStore<T extends TimestampedPoint>(
  key: string,
  validate: (value: unknown) => value is T,
): PointStore<T> {
  const parsed = readStoredJson(key);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {};
  }
  const store: Record<string, readonly T[]> = {};
  for (const [seriesKey, value] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (!Array.isArray(value)) continue;
    const points = value.filter(validate).sort(byTimestamp);
    if (points.length > 0) store[seriesKey] = points;
  }
  return store;
}

export function writePointStore<T extends TimestampedPoint>(
  key: string,
  store: PointStore<T>,
  maxPointsPerSeries: number,
  maxSeries: number,
): void {
  writeStoredJson(
    key,
    capStoreSeries(
      mapStoreSeries(store, (points) => points.slice(-maxPointsPerSeries)),
      maxSeries,
    ),
  );
}

/** Per-series union; on a shared timestamp the right-hand store wins. */
export function mergePointStores<T extends TimestampedPoint>(
  persisted: PointStore<T>,
  current: PointStore<T>,
): PointStore<T> {
  const merged: Record<string, readonly T[]> = { ...persisted };
  for (const [seriesKey, points] of Object.entries(current)) {
    merged[seriesKey] = mergePointLists(persisted[seriesKey] ?? [], points);
  }
  return merged;
}

function mapStoreSeries<T extends TimestampedPoint>(
  store: PointStore<T>,
  map: (points: readonly T[]) => readonly T[],
): Record<string, readonly T[]> {
  const next: Record<string, readonly T[]> = {};
  for (const [seriesKey, points] of Object.entries(store)) {
    const mapped = map(points);
    if (mapped.length > 0) next[seriesKey] = mapped;
  }
  return next;
}

/**
 * Drop the least-recently-updated series when the store exceeds
 * `maxSeries`, so browsing many bus stops cannot grow storage unboundedly.
 */
function capStoreSeries<T extends TimestampedPoint>(
  store: Record<string, readonly T[]>,
  maxSeries: number,
): Record<string, readonly T[]> {
  const keys = Object.keys(store);
  if (keys.length <= maxSeries) return store;

  const lastUpdated = (points: readonly T[]): number => {
    const last = points[points.length - 1];
    const parsed = last ? Date.parse(last.timestamp) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const ordered = keys
    .map((seriesKey) => ({ seriesKey, at: lastUpdated(store[seriesKey]) }))
    .sort((a, b) => a.at - b.at);
  const drop = new Set(ordered.slice(0, keys.length - maxSeries).map((e) => e.seriesKey));

  const capped: Record<string, readonly T[]> = {};
  for (const seriesKey of keys) {
    if (!drop.has(seriesKey)) capped[seriesKey] = store[seriesKey];
  }
  return capped;
}
