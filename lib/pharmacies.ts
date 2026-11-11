/**
 * Popup copy for the static pharmacy layer. Pure so the
 * map and tests share one definition.
 */
import type { PopupLine } from "@/lib/mobility";
import type { Pharmacy } from "@/types";

export const PHARMACY_SOURCE_HINT =
  "Source: HSA via data.gov.sg (Singapore Open Data Licence)";

export const describePharmacy = (pharmacy: Pharmacy): PopupLine[] => [
  { text: pharmacy.name, kind: "name" },
  { text: "Retail pharmacy", kind: "status", tone: "muted" },
  ...(pharmacy.address ? [{ text: pharmacy.address, kind: "detail" as const }] : []),
  { text: PHARMACY_SOURCE_HINT, kind: "hint" },
];
