/**
 * Storage keys and parsers for UI preferences persisted in localStorage.
 * Parsers return `undefined` for unusable stored values so callers keep
 * their defaults.
 */
import {
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
} from "@/lib/geo-filter";
import { isRouteableMrtStation } from "@/lib/mrt-routing";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationPrefs,
  type SeenSignals,
} from "@/lib/notifications";
import type { SignalCategory } from "@/lib/signals";

export const SENSOR_VISIBILITY_KEY = "argus.prefs.sensors.v1";
export const GYM_BRANDS_KEY = "argus.prefs.gym.brands.v1";
export const HERITAGE_KINDS_KEY = "argus.prefs.heritage.kinds.v1";
export const HEALTHCARE_KINDS_KEY = "argus.prefs.healthcare.kinds.v1";
export const SUPERMARKET_BRANDS_KEY = "argus.prefs.supermarket.brands.v1";
export const SCHOOL_LEVELS_KEY = "argus.prefs.school.levels.v1";
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

// ---------- MRT route planner ----------

export const MRT_START_KEY = "argus.prefs.mrt.start.v1";
export const MRT_END_KEY = "argus.prefs.mrt.end.v1";

/** Accept only stations the router knows, so a stale name cannot strand a plan. */
export function parseMrtStation(stored: unknown): string | undefined {
  if (typeof stored !== "string" || stored.length === 0) return undefined;
  return isRouteableMrtStation(stored) ? stored : undefined;
}

// ---------- Notifications ----------

export const NOTIFICATION_PREFS_KEY = "argus.prefs.notifications.v1";
export const SEEN_SIGNALS_KEY = "argus.prefs.notifications.seen.v1";

export function parseNotificationPrefs(
  stored: unknown,
): NotificationPrefs | undefined {
  return parseSensorVisibility(stored, DEFAULT_NOTIFICATION_PREFS);
}

/** Keep only well-formed categories, so a damaged one just takes a new baseline. */
export function parseSeenSignals(stored: unknown): SeenSignals | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return undefined;
  }
  const entries = stored as Partial<Record<string, unknown>>;
  const seen: SeenSignals = {};
  for (const category of ["rail", "road", "weather"] satisfies SignalCategory[]) {
    const ids = entries[category];
    if (Array.isArray(ids) && ids.every((id) => typeof id === "string")) {
      seen[category] = ids as string[];
    }
  }
  return seen;
}

// ---------- Boolean flags and derived keys ----------

export const AIR_SECTION_PINNED_KEY = "argus.prefs.air.section.pinned.v1";

export function parseStoredBoolean(stored: unknown): boolean | undefined {
  return typeof stored === "boolean" ? stored : undefined;
}

/**
 * Namespaced key for a pref derived from text, so every storage key stays
 * discoverable in this file. `prefKey("panel-expanded", "NEWS")` becomes
 * `argus.prefs.panel-expanded.v1:news`.
 */
export function prefKey(namespace: string, slug: string): string {
  const normalized = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `argus.prefs.${namespace}.v1:${normalized}`;
}
