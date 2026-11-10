/**
 * Mall store directories: the pure helpers shared by the authoring-time
 * script (scripts/fetch-mall-stores.ts) and the focus dialog.
 *
 * The upstream rows (curioputterings/singapore-mall-data `stores.json`) are
 * scraped from each operator's site, so units and levels come in many shapes
 * ("unit-b1-12", "#B1-12", "Level 01", "South Wing, Basement 1", ...). The
 * script cleans them once so the client only groups, sorts and filters.
 */
import type { Mall, MallStore } from "@/types";

// ---------- Cleaning (authoring time) ----------

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : null;

/**
 * URL-slug units into Singapore's "#level-unit" form: "unit-b1-k12" →
 * "#B1-K12", "unit-01-62-63" → "#01-62/63" (adjoining units), "01-02-to-05"
 * → "#01-02 TO 05". Anything else is kept as written.
 */
export const normalizeUnit = (raw: unknown): string | null => {
  const value = text(raw);
  if (!value) return null;
  const slug = /^(?:unit-)?((?:jp\d)?b?\d{1,2})-([a-z0-9]+(?:-[a-z0-9]+)*)$/i.exec(value);
  if (!slug) return value;
  const units = slug[2].replace(/-to-/gi, " TO ").split("-").join("/");
  return `#${slug[1]}-${units}`.toUpperCase();
};

// ION Orchard's rooftop bar is on level 55-56; nothing in the data is higher.
const MAX_LEVEL = 60;
const levelKey = (basement: boolean, number: number, mezzanine = false): string | null =>
  number >= 1 && number <= MAX_LEVEL ? `${basement ? "B" : "L"}${number}${mezzanine ? "M" : ""}` : null;

/** One level token ("01", "L2", "Level 3", "Basement 1", "Level B2", "B2M") → "L1" / "B2M". */
const parseLevelToken = (token: string): string | null => {
  const value = token.trim().replace(/^block [a-z]\s+/i, "");
  const basement = /^(?:basement\s*|level\s*b|b)0*(\d{1,2})(m?)$/i.exec(value);
  if (basement) return levelKey(true, Number(basement[1]), basement[2] !== "");
  const above = /^(?:level\s*|l)?0*(\d{1,2})$/i.exec(value);
  return above ? levelKey(false, Number(above[1])) : null;
};

/**
 * Level key for grouping: the upstream level field when it reads as a floor,
 * else the floor in the unit number ("#B1-12", "#JP1B1-12" at Jurong Point),
 * else a named area ("Tower 3", "Fountain Court"), else null.
 */
export const normalizeLevel = (rawLevel: unknown, unit: string | null): string | null => {
  const level = text(rawLevel);
  // "South Wing, Level 1" / "01, 02" / "L3 OPEN PLAZA": the first comma part
  // that reads as a floor, whole or by its first word.
  const fromField = level
    ?.split(",")
    .map((part) => parseLevelToken(part) ?? parseLevelToken(part.trim().split(" ")[0]))
    .find((key) => key !== null);
  if (fromField) return fromField;
  const fromUnit = unit ? /#(?:JP\d)?(B\d{1,2}|\d{2})(M?)-/i.exec(unit) : null;
  if (fromUnit) {
    const key = parseLevelToken(fromUnit[1] + fromUnit[2]);
    if (key) return key;
  }
  return level && !/^\d+$/.test(level) ? level : null;
};

/** Only http(s) links; bare "www.x.com" gains https://, placeholders like "-" drop. */
export const normalizeWebsite = (raw: unknown): string | null => {
  const value = text(raw);
  if (!value || /\s/.test(value) || !value.includes(".")) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
};

export interface RawStoreRow {
  store_name?: unknown;
  mall?: unknown;
  unit?: unknown;
  level?: unknown;
  scope_of_business?: unknown;
  raw_category?: unknown;
  is_fnb?: unknown;
  is_halal?: unknown;
  website?: unknown;
}

export const cleanStoreRow = (row: RawStoreRow): MallStore | null => {
  const name = text(row.store_name);
  if (!name) return null;
  const unit = normalizeUnit(row.unit);
  const fnb = row.is_fnb === true;
  return {
    name,
    unit,
    level: normalizeLevel(row.level, unit),
    category: text(row.scope_of_business) ?? text(row.raw_category) ?? (fnb ? "Food & Beverage" : null),
    fnb,
    halal: row.is_halal === true,
    website: normalizeWebsite(row.website),
  };
};

// ---------- Matching store lists to map malls (authoring time) ----------

export const normalizeMallName = (name: string) =>
  name.toLowerCase().replace(/\(.*?\)/g, " ").replace(/&/g, "and").replace(/\bsingapore\b/g, "").replace(/[^a-z0-9]/g, "");
const withoutSuffix = (name: string) =>
  normalizeMallName(name.replace(/\b(?:shopping\s+(?:centre|center|mall)|mall)\s*$/i, ""));

export interface CuratedMall {
  mall_name: string;
  postal_code?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
}

/**
 * The map mall a store list belongs to: an explicit alias, the same name, the
 * curated mall record's postcode or position (~300m), or the same name once a
 * trailing "Mall"/"Shopping Centre" is dropped (only when that is unique).
 */
export const matchStoreListMall = (
  listName: string,
  malls: ReadonlyArray<Mall>,
  curated: ReadonlyArray<CuratedMall>,
  aliases: Readonly<Record<string, string>> = {},
): Mall | undefined => {
  const alias = aliases[listName];
  if (alias) return malls.find((mall) => mall.name === alias);
  const key = normalizeMallName(listName);
  const byName = malls.find((mall) => normalizeMallName(mall.name) === key);
  if (byName) return byName;
  const record = curated.find((info) => normalizeMallName(info.mall_name) === key);
  if (record?.postal_code) {
    const byPostcode = malls.find((mall) => mall.address?.includes(String(record.postal_code)));
    if (byPostcode) return byPostcode;
  }
  const lat = Number(record?.latitude);
  const lng = Number(record?.longitude);
  if (record?.latitude && Number.isFinite(lat) && Number.isFinite(lng)) {
    const nearest = malls
      .map((mall) => ({ mall, distance: Math.hypot(mall.lat - lat, mall.lng - lng) }))
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance < 0.003) return nearest.mall;
  }
  const loose = malls.filter((mall) => withoutSuffix(mall.name) === withoutSuffix(listName));
  return loose.length === 1 ? loose[0] : undefined;
};

// ---------- Validation (the client checks what it fetches) ----------

const isNullableString = (value: unknown) => value === null || typeof value === "string";

export const isMallStoreList = (value: unknown): value is MallStore[] =>
  Array.isArray(value) &&
  value.every((store) => {
    const s = store as Partial<MallStore> | null;
    return (
      typeof s?.name === "string" && s.name.length > 0 &&
      isNullableString(s.unit) && isNullableString(s.level) && isNullableString(s.category) &&
      typeof s.fnb === "boolean" && typeof s.halal === "boolean" &&
      (s.website === null || (typeof s.website === "string" && /^https?:\/\//.test(s.website)))
    );
  });

// ---------- Presentation ----------

const LEVEL_KEY_RE = /^([BL])(\d{1,2})(M?)$/;

/** "B2M" → "Basement 2 Mezzanine", "L3" → "Level 3"; named areas pass through. */
export const levelLabel = (level: string | null): string => {
  if (level === null) return "Level not listed";
  const match = LEVEL_KEY_RE.exec(level);
  if (!match) return level;
  return `${match[1] === "B" ? "Basement" : "Level"} ${match[2]}${match[3] ? " Mezzanine" : ""}`;
};

/** Deepest basement first, then up the floors, named areas, and unlisted last. */
const levelRank = (level: string | null): number => {
  if (level === null) return Number.POSITIVE_INFINITY;
  const match = LEVEL_KEY_RE.exec(level);
  if (!match) return 1_000;
  const number = Number(match[2]);
  return (match[1] === "B" ? -number : number) + (match[3] ? 0.5 : 0);
};

export const compareLevels = (a: string | null, b: string | null) =>
  levelRank(a) - levelRank(b) || (a ?? "").localeCompare(b ?? "", "en-SG");

export const compareStores = (a: MallStore, b: MallStore) =>
  a.name.localeCompare(b.name, "en-SG", { sensitivity: "base" }) || (a.unit ?? "").localeCompare(b.unit ?? "", "en-SG");

export interface StoreFilter {
  query?: string;
  category?: string | null;
  halalOnly?: boolean;
}

/** Name or unit contains the query (ignoring case and a leading "#"). */
export const filterStores = (stores: ReadonlyArray<MallStore>, { query = "", category = null, halalOnly = false }: StoreFilter) => {
  const needle = query.trim().toLowerCase().replace(/^#/, "");
  return stores.filter((store) =>
    (!category || store.category === category) &&
    (!halalOnly || store.halal) &&
    (!needle || store.name.toLowerCase().includes(needle) || (store.unit?.toLowerCase().includes(needle) ?? false)));
};

/** Categories with counts, most common first. */
export const countCategories = (stores: ReadonlyArray<MallStore>) => {
  const counts = new Map<string, number>();
  for (const store of stores) if (store.category) counts.set(store.category, (counts.get(store.category) ?? 0) + 1);
  return [...counts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
};

export const groupStoresByLevel = (stores: ReadonlyArray<MallStore>) => {
  const groups = new Map<string | null, MallStore[]>();
  for (const store of stores) groups.set(store.level, [...(groups.get(store.level) ?? []), store]);
  return [...groups]
    .sort(([a], [b]) => compareLevels(a, b))
    .map(([level, items]) => ({ level, label: levelLabel(level), stores: [...items].sort(compareStores) }));
};
