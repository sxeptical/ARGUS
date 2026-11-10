/**
 * Popup copy, search entries and brand filtering for the static gym layer.
 * Pure so the map, state and tests share one definition; formatting of
 * `opening_hours` reuses the shared formatter in lib/amenities.
 */
import { formatOpeningHours } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { Gym, GymBrand, GymCategory, MapSearchResult } from "@/types";

export const GYM_CATEGORY_LABEL: Record<GymCategory, string> = {
  gym: "Gym",
  yoga: "Yoga studio",
  pilates: "Pilates studio",
  "martial-arts": "Martial arts gym",
  crossfit: "CrossFit gym",
  climbing: "Climbing gym",
  public: "Public gym",
};

export const GYM_SOURCE_HINT: Record<Gym["source"], string> = {
  alltheplaces: "Source: All The Places (CC0)",
  osm: "Location: © OpenStreetMap contributors (ODbL)",
  sportsg: "Source: SportSG via data.gov.sg (Singapore Open Data Licence)",
};

export const describeGym = (gym: Gym): PopupLine[] => {
  const category = GYM_CATEGORY_LABEL[gym.category];
  const hours = gym.openingHours ? formatOpeningHours(gym.openingHours) : null;
  // "Independent" is the absence of a known operator, not a brand to show.
  const brand = gym.brand === "Independent" || gym.brand === gym.name ? null : gym.brand;
  return [
    { text: gym.name, kind: "name" },
    {
      text: brand ? `${brand} · ${category}` : category,
      kind: "status",
      tone: "muted",
    },
    ...(hours ? [{ text: hours, kind: "detail" as const }] : []),
    ...(gym.address ? [{ text: gym.address, kind: "detail" as const }] : []),
    { text: GYM_SOURCE_HINT[gym.source], kind: "hint" },
  ];
};

export const buildGymSearchResults = (gyms: ReadonlyArray<Gym>): MapSearchResult[] =>
  gyms.map((gym) => ({
    id: gym.id,
    type: "gym",
    name: gym.name,
    lat: gym.lat,
    lng: gym.lng,
    zoom: 16,
    keywords: [
      "gym",
      "fitness",
      GYM_CATEGORY_LABEL[gym.category],
      gym.brand,
      ...(gym.address ? [gym.address] : []),
    ],
  }));

/** Gyms whose operator brand is on (absent from the record means on). */
export const filterGymsByBrand = (
  gyms: ReadonlyArray<Gym>,
  brandVisible: Readonly<Partial<Record<GymBrand, boolean>>>,
): Gym[] => gyms.filter((gym) => brandVisible[gym.brand] !== false);

export type GymBrandCount = { brand: GymBrand; count: number };

/** Per-brand counts, biggest first (ties alphabetical), for the brand chips. */
export const gymBrandCounts = (gyms: ReadonlyArray<Gym>): GymBrandCount[] => {
  const counts = new Map<GymBrand, number>();
  for (const gym of gyms) counts.set(gym.brand, (counts.get(gym.brand) ?? 0) + 1);
  return [...counts.entries()]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand, "en-SG"));
};

/**
 * Brand options for the sub-filter: ActiveSG pinned first (the public
 * option), then the rest biggest-first, so the top chips are the ones with
 * the most gyms behind them.
 */
export const orderedGymBrandCounts = (gyms: ReadonlyArray<Gym>): GymBrandCount[] => {
  const counts = gymBrandCounts(gyms);
  const activesg = counts.find((entry) => entry.brand === "ActiveSG");
  return [...(activesg ? [activesg] : []), ...counts.filter((entry) => entry.brand !== "ActiveSG")];
};
