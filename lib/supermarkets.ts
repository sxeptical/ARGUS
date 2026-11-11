/**
 * Popup copy for the static supermarket layer; `opening_hours` formatting
 * reuses lib/amenities. Search and the brand sub-filter are declared in
 * lib/amenity-layers.ts.
 */
import { formatOpeningHours } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { Supermarket } from "@/types";

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
