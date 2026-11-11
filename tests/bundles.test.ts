import { describe, expect, test } from "bun:test";
import { HAWKER_CENTRES, MALLS } from "@/lib/data/amenities";
import { COMMUNITY_CLUBS } from "@/lib/data/community-clubs";
import { GYMS } from "@/lib/data/gyms";
import { HEALTHCARE_SITES } from "@/lib/data/healthcare";
import { HERITAGE_SITES } from "@/lib/data/heritage";
import { HOTELS } from "@/lib/data/hotels";
import { LIBRARIES } from "@/lib/data/libraries";
import { PHARMACIES } from "@/lib/data/pharmacies";
import { SCHOOLS } from "@/lib/data/schools";
import { SUPERMARKETS } from "@/lib/data/supermarkets";

type BundlePlace = { id: string; lat: number; lng: number; photos?: ReadonlyArray<unknown> };

// `atLeast` preserves each bundle's original minimum: ">N" is strict while
// ">=N" allows exactly N.
const bundles: ReadonlyArray<{ name: string; places: ReadonlyArray<BundlePlace>; min: number; atLeast?: boolean; skipPhotos?: boolean }> = [
  { name: "hawker centres", places: HAWKER_CENTRES, min: 100 },
  { name: "malls", places: MALLS, min: 150 },
  { name: "libraries", places: LIBRARIES, min: 28, atLeast: true },
  { name: "supermarkets", places: SUPERMARKETS, min: 540 },
  { name: "heritage sites", places: HERITAGE_SITES, min: 240 },
  { name: "hotels", places: HOTELS, min: 400 },
  { name: "community clubs", places: COMMUNITY_CLUBS, min: 120 },
  { name: "pharmacies", places: PHARMACIES, min: 200 },
  { name: "gyms", places: GYMS, min: 300 },
  { name: "schools", places: SCHOOLS, min: 320, atLeast: true },
  { name: "healthcare sites", places: HEALTHCARE_SITES, min: 1400, skipPhotos: true },
];

describe("shipped bundles", () => {
  test("every bundle is large enough and sits inside Singapore with unique ids", () => {
    for (const { places, min, atLeast } of bundles) {
      expect(atLeast ? places.length >= min : places.length > min).toBe(true);
      expect(new Set(places.map((place) => place.id)).size).toBe(places.length);
      for (const place of places) {
        expect(place.lng).toBeGreaterThanOrEqual(103.5);
        expect(place.lng).toBeLessThanOrEqual(104.1);
        expect(place.lat).toBeGreaterThanOrEqual(1.1);
        expect(place.lat).toBeLessThanOrEqual(1.5);
      }
    }
  });

  test("no place carries more than three photos", () => {
    for (const { places, skipPhotos } of bundles) {
      if (skipPhotos) continue;
      for (const place of places) {
        if (place.photos) expect(place.photos.length).toBeLessThanOrEqual(3);
      }
    }
    // Healthcare photos are only curated for hospitals.
    expect(HEALTHCARE_SITES.every((site) => site.kind !== "hospital" || site.photos.length <= 3)).toBe(true);
  });
});
