/**
 * Popup copy and search entries for the static gym layer. Pure so the map and
 * tests share one definition; formatting of `opening_hours` reuses the shared
 * formatter in lib/amenities.
 */
import { formatOpeningHours } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { Gym, GymCategory, MapSearchResult } from "@/types";

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
  return [
    { text: gym.name, kind: "name" },
    {
      text: gym.brand && gym.brand !== gym.name ? `${gym.brand} · ${category}` : category,
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
      ...(gym.brand ? [gym.brand] : []),
      ...(gym.address ? [gym.address] : []),
    ],
  }));
