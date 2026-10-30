/**
 * Storage keys and parsers for UI preferences persisted in localStorage.
 * Parsers return `undefined` for unusable stored values so callers keep
 * their defaults.
 */
import {
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
} from "@/lib/geo-filter";

export const SENSOR_VISIBILITY_KEY = "argus.prefs.sensors.v1";
export const GEO_FILTER_CENTER_KEY = "argus.prefs.geo-filter.center.v1";
export const GEO_FILTER_RADIUS_KEY = "argus.prefs.geo-filter.radius.v1";

/**
 * Take each known sensor's stored flag, falling back to its default. Unknown
 * stored keys are dropped and newly added sensors get their default.
 */
export function parseSensorVisibility<K extends string>(
  stored: unknown,
  defaults: Readonly<Record<K, boolean>>,
): Record<K, boolean> | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return undefined;
  }
  const flags = stored as Partial<Record<string, unknown>>;
  const next: Record<K, boolean> = { ...defaults };
  for (const key of Object.keys(defaults) as K[]) {
    const flag = flags[key];
    if (typeof flag === "boolean") next[key] = flag;
  }
  return next;
}

/** `null` is a valid stored value: the filter was cleared. */
export function parseGeoFilterCenter(
  stored: unknown,
): readonly [number, number] | null | undefined {
  if (stored === null) return null;
  if (!Array.isArray(stored) || stored.length !== 2) return undefined;
  const [lng, lat] = stored as unknown[];
  if (
    typeof lng !== "number" ||
    typeof lat !== "number" ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng) > 180 ||
    Math.abs(lat) > 90
  ) {
    return undefined;
  }
  return [lng, lat];
}

/** Clamp into the slider range so a changed range cannot strand a value. */
export function parseGeoFilterRadius(stored: unknown): number | undefined {
  if (typeof stored !== "number" || !Number.isFinite(stored)) return undefined;
  return Math.min(
    GEO_FILTER_MAX_RADIUS_M,
    Math.max(GEO_FILTER_MIN_RADIUS_M, stored),
  );
}
