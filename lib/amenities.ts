/**
 * Popup copy and search entries for the static mall and hawker centre
 * layers. Pure so the map and tests share one definition.
 */
import type { PopupLine } from "@/lib/mobility";
import type { HawkerCentre, MapSearchResult, Mall, PlacePhoto } from "@/types";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const DAY_NAMES: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun" };

/**
 * Turn the common OpenStreetMap `opening_hours` shapes into plain English
 * ("Mo-Su,PH 10:00-22:00" → "Daily 10:00–22:00"). Returns null for "off".
 */
export const formatOpeningHours = (raw: string): string | null => {
  const value = raw.trim().replace(/\s*,\s*PH\b/g, "").replace(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g, "$1–$2");
  if (value === "off") return null;
  if (value === "24/7" || /^Mo-Su 00:00–24:00$/.test(value)) return "Open 24 hours";
  if (/^\d{2}:\d{2}–\d{2}:\d{2}$/.test(value)) return `Daily ${value}`;
  return value
    .replace(/^Mo-Su\b/, "Daily")
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (day) => DAY_NAMES[day])
    .replace(/;\s*/g, ", ");
};

export const describeHawkerCentre = (hawker: HawkerCentre): PopupLine[] => [
  { text: hawker.name, kind: "name" },
  hawker.status === "open"
    ? { text: "In operation", kind: "status", tone: "success" }
    : {
        text: hawker.expectedYear ? `Under construction · expected ${hawker.expectedYear}` : "Under construction",
        kind: "status",
        tone: "muted",
      },
  ...(hawker.stalls === null ? [] : [{ text: plural(hawker.stalls, "cooked food stall", "cooked food stalls"), kind: "count" as const }]),
  ...(hawker.address ? [{ text: hawker.address, kind: "detail" as const }] : []),
  ...creditLine(hawker.photos),
  { text: "Source: NEA via data.gov.sg", kind: "hint" },
];

/**
 * "Photos: A, B (CC BY-SA 4.0); C (CC BY 2.5) · Wikimedia Commons", or
 * "Photo: NEA" for NEA's own hawker centre photo.
 */
export const photoCredit = (photos: ReadonlyArray<PlacePhoto>): string | null => {
  const commons = photos.filter((photo) => photo.source === "commons");
  if (!commons.length) return photos.some((photo) => photo.source === "nea") ? "Photo: NEA" : null;
  const authorsByLicense = new Map<string, Set<string>>();
  for (const photo of commons) {
    const license = photo.license ?? "unknown licence";
    authorsByLicense.set(license, (authorsByLicense.get(license) ?? new Set()).add(photo.author));
  }
  const groups = [...authorsByLicense].map(([license, authors]) => `${[...authors].join(", ")} (${license})`);
  return `${commons.length === 1 ? "Photo" : "Photos"}: ${groups.join("; ")} · Wikimedia Commons`;
};

const creditLine = (photos: ReadonlyArray<PlacePhoto>): PopupLine[] => {
  const credit = photoCredit(photos);
  return credit ? [{ text: credit, kind: "hint" }] : [];
};

export const describeMall = (mall: Mall): PopupLine[] => {
  const hours = mall.openingHours ? formatOpeningHours(mall.openingHours) : null;
  return [
    { text: mall.name, kind: "name" },
    ...(mall.stores === null
      ? []
      : [{
          text: mall.fnb === null ? plural(mall.stores, "shop", "shops") : `${plural(mall.stores, "shop", "shops")} · ${mall.fnb} food & drink`,
          kind: "count" as const,
        }]),
    ...(mall.nearestMrt ? [{ text: `Nearest MRT: ${mall.nearestMrt}`, kind: "detail" as const }] : []),
    ...(hours ? [{ text: hours, kind: "detail" as const }] : []),
    ...(mall.address ? [{ text: mall.address, kind: "detail" as const }] : []),
    ...creditLine(mall.photos),
    {
      text: mall.stores === null ? "Location: © OpenStreetMap contributors" : "Shops: curioputterings/singapore-mall-data · Location: © OpenStreetMap",
      kind: "hint",
    },
  ];
};

export const buildMallSearchResults = (malls: ReadonlyArray<Mall>): MapSearchResult[] =>
  malls.map((mall) => ({
    id: mall.id,
    type: "mall",
    name: mall.name,
    lat: mall.lat,
    lng: mall.lng,
    zoom: 16,
    keywords: ["mall", "shopping", ...(mall.address ? [mall.address] : [])],
  }));

export const buildHawkerSearchResults = (hawkers: ReadonlyArray<HawkerCentre>): MapSearchResult[] =>
  hawkers.map((hawker) => ({
    id: hawker.id,
    type: "hawker",
    name: hawker.name,
    lat: hawker.lat,
    lng: hawker.lng,
    zoom: 16,
    keywords: ["hawker", "food centre", ...(hawker.address ? [hawker.address] : [])],
  }));
