/**
 * Keyless Google Maps links for point markers. Uses the official Maps URLs
 * API (`/maps/search/?api=1&query=...`) so a link opens the normal Maps site
 * or app on any platform.
 *
 * Query rule, in order:
 * 1. Name + address, e.g. "Tampines ActiveSG Gym, 1 Tampines Walk, Singapore
 *    528523". A street address makes Maps land on the business listing rather
 *    than an anonymous pin, so it is preferred whenever one exists.
 * 2. Address alone, when there is no name.
 * 3. Coordinates, when there is no usable address (OSM gyms, new hawker
 *    centres, heritage sites with no street address). A pin is exact and
 *    avoids a same-named chain branch elsewhere in Singapore.
 * 4. Name + region ("..., Singapore"), only when there are no coordinates.
 *
 * Hotels are the one deliberate exception to "addresses are strong": their
 * dataset address is just "Singapore <postcode>". That is still passed as the
 * address because a Singapore postal code identifies a single building, and
 * pairing it with the hotel name is what disambiguates chain branches.
 */
const MAPS_SEARCH_URL = "https://www.google.com/maps/search/?api=1";

export type GoogleMapsTarget = {
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** Region appended to a name-only search. Defaults to "Singapore". */
  region?: string | null;
};

const cleanText = (value?: string | null): string | null => {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned ? cleaned : null;
};

/** Six decimals is roughly 0.1 m, plenty for a marker pin. */
const formatCoord = (value: number): string =>
  String(Number.parseFloat(value.toFixed(6)));

/** `"1.35,103.84"`, or null when either coordinate is missing/invalid. */
export function formatCoordinates(
  lat?: number | null,
  lng?: number | null,
): string | null {
  if (lat === null || lat === undefined || lng === null || lng === undefined) {
    return null;
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `${formatCoord(lat)},${formatCoord(lng)}`;
}

/** Google Maps search URL for a point marker, or null when there is nothing to search. */
export function googleMapsUrl({
  name,
  address,
  lat,
  lng,
  region = "Singapore",
}: GoogleMapsTarget): string | null {
  const place = cleanText(name);
  const street = cleanText(address);
  const coords = formatCoordinates(lat, lng);
  const regionLabel = cleanText(region);

  const query =
    place && street
      ? `${place}, ${street}`
      : (street ??
        coords ??
        (place && regionLabel ? `${place}, ${regionLabel}` : place));

  return query ? `${MAPS_SEARCH_URL}&query=${encodeURIComponent(query)}` : null;
}
