/**
 * Shared parser for KML-derived data.gov.sg GeoJSON packs, which carry all
 * their attributes packed into an HTML table in `properties.Description`
 * instead of flat fields (e.g. MOH CHAS clinics, NLB libraries, ECDA
 * preschools). One entry per `<th>KEY</th><td>VAL</td>` pair; HTML is
 * decoded and whitespace collapsed, empty values read as null.
 *
 * Some packs double-encode the table (`&lt;` entities) — decode once before
 * matching so either shape parses.
 */
const decodeEntities = (value) =>
  String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ");

/**
 * Parse a KML `Description` HTML table into a plain record. Returns an
 * empty record when there is no table.
 */
export const parseKmlDescription = (description) => {
  const html = decodeEntities(description ?? "");
  const record = {};
  const re = /<th[^>]*>(.*?)<\/th>\s*<td[^>]*>(.*?)<\/td>/gis;
  let match;
  while ((match = re.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, "").trim();
    const value = match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (key) record[key] = value || null;
  }
  return record;
};

/** Trimmed string or null, for raw properties and parsed records alike. */
export const text = (value) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
