/**
 * Field helpers every fetch script applies to its source records, so all
 * bundles agree on what counts as a usable value and a usable position.
 */

/** Trimmed string, or null for anything empty or non-string. */
export const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);

/** Six decimals is roughly 0.1 m, plenty for a map marker. */
export const round = (value) => Math.round(value * 1e6) / 1e6;

/**
 * Website URL, prefixed with https:// when it has no http(s) scheme. Null for
 * empty values and for anything that still isn't a URL host after prefixing
 * (spaces, "n/a", a bare scheme), so junk tags never reach the UI.
 */
export const websiteOf = (raw) => {
  const website = text(raw);
  if (!website || /\s/.test(website)) return null;
  const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const host = /^https?:\/\/([^\s/?#]+)(?:[/?#]|$)/i.exec(url)?.[1];
  return host && /\.[^.]/.test(host) ? url : null;
};

/**
 * "68615755" -> "+65 6861 5755", including the 10-digit "65..." variant
 * ("+65 6861 5755"). Anything else is kept as tagged.
 */
export const phoneOf = (raw) => {
  const digits = text(raw)?.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.length === 8) return `+65 ${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits.startsWith("65") && digits.length === 10
    ? `+65 ${digits.slice(2, 6)} ${digits.slice(6)}`
    : text(raw);
};

/** Lower-cased whole words: "Ang Mo Supermarket" -> ["ang","mo","supermarket"]. */
export const tokens = (value) => String(value ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/**
 * Whether `needle` appears as a contiguous, ordered run of whole tokens in
 * `haystack`: ["fair","price"] matches "Fair Price", but never a reordering or
 * a substring ("prim" does not match "prime").
 */
export const hasTokenSeq = (haystack, needle) => {
  if (!needle.length || haystack.length < needle.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((token, offset) => haystack[i + offset] === token)) return true;
  }
  return false;
};

const SG_BOUNDS = { minLat: 1.1, maxLat: 1.5, minLng: 103.5, maxLng: 104.1 };

/** Drops records geocoded outside Singapore (bad source coordinates). */
export const inSingapore = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= SG_BOUNDS.minLat && lat <= SG_BOUNDS.maxLat && lng >= SG_BOUNDS.minLng && lng <= SG_BOUNDS.maxLng;
