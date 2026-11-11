/**
 * Labels and popup copy for the static gym layer; `opening_hours`
 * formatting reuses lib/amenities. Search and the brand sub-filter are
 * declared in lib/amenity-layers.ts.
 */
import { formatOpeningHours } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { Gym, GymCategory } from "@/types";

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
  curated: "Source: ActiveSG facility directory",
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
