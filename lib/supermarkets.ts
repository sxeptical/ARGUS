/**
 * Popup copy, search entries and brand filtering for the static
 * supermarket layer. Pure so the map, state and tests share one
 * definition; `opening_hours` formatting reuses lib/amenities.
 */
import { formatOpeningHours } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { MapSearchResult, Supermarket, SupermarketBrand } from "@/types";

export const SUPERMARKET_SOURCE_HINT =
  "Location: © OpenStreetMap contributors (ODbL)";

export const describeSupermarket = (market: Supermarket): PopupLine[] => {
  const hours = market.openingHours ? formatOpeningHours(market.openingHours) : null;
  // "Other" is the absence of a known operator, not a brand to show.
  const brand = market.brand === "Other" || market.brand === market.name ? null : market.brand;
  return [
    { text: market.name, kind: "name" },
    { text: brand ? `${brand} supermarket` : "Supermarket", kind: "status", tone: "muted" },
    ...(hours ? [{ text: hours, kind: "detail" as const }] : []),
    ...(market.address ? [{ text: market.address, kind: "detail" as const }] : []),
    { text: SUPERMARKET_SOURCE_HINT, kind: "hint" },
  ];
};

export const buildSupermarketSearchResults = (markets: ReadonlyArray<Supermarket>): MapSearchResult[] =>
  markets.map((market) => ({
    id: market.id,
    type: "supermarket",
    name: market.name,
    lat: market.lat,
    lng: market.lng,
    zoom: 16,
    keywords: [
      "supermarket",
      "grocery",
      market.brand,
      ...(market.address ? [market.address] : []),
    ],
  }));

/** Supermarkets whose brand is on (absent from the record means on). */
export const filterSupermarketsByBrand = (
  markets: ReadonlyArray<Supermarket>,
  brandVisible: Readonly<Partial<Record<SupermarketBrand, boolean>>>,
): Supermarket[] => markets.filter((market) => brandVisible[market.brand] !== false);

export type SupermarketBrandCount = { brand: SupermarketBrand; count: number };

/** Per-brand counts, biggest first (ties alphabetical), for the brand chips. */
export const supermarketBrandCounts = (markets: ReadonlyArray<Supermarket>): SupermarketBrandCount[] => {
  const counts = new Map<SupermarketBrand, number>();
  for (const market of markets) counts.set(market.brand, (counts.get(market.brand) ?? 0) + 1);
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, "en-SG"));
};

/**
 * Brand options for the sub-filter: biggest first, but the residual
 * "Other" stays last — it is the unbranded remainder, not a brand.
 */
export const orderedSupermarketBrandCounts = (markets: ReadonlyArray<Supermarket>): SupermarketBrandCount[] => {
  const counts = supermarketBrandCounts(markets);
  const other = counts.find((entry) => entry.brand === "Other");
  return [...counts.filter((entry) => entry.brand !== "Other"), ...(other ? [other] : [])];
};
