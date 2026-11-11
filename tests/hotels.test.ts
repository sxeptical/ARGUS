import { describe, expect, test } from "bun:test";
import { HOTELS, validateHotelsBundle } from "@/lib/hotels-data";
import { buildHotelSearchResults, describeHotel } from "@/lib/hotels";
import type { Hotel } from "@/types";

const hotel = (overrides: Partial<Hotel> = {}): Hotel => ({
  id: "hotel-19844",
  name: "Hotel Bencoolen",
  address: "Singapore 189626",
  rooms: 84,
  lat: 1.2992,
  lng: 103.8501,
  photos: [],
  ...overrides,
});

const commonsPhoto: Hotel["photos"][number] = {
  thumb: "https://thumb.wikimedia.org/a.jpg",
  page: "https://commons.wikimedia.org/wiki/File:A.jpg",
  author: "Terence Ong",
  license: "CC BY 2.5",
  source: "commons",
};

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("hotels bundle", () => {
  test("ships plausible Singapore licensed hotels", () => {
    expect(HOTELS.length).toBeGreaterThan(400);
    for (const place of HOTELS) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(HOTELS.map((h) => h.id)).size).toBe(HOTELS.length);
    expect(HOTELS.every((h) => h.photos.length <= 3)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateHotelsBundle([hotel()])).toBe(true);
    expect(validateHotelsBundle({ hotels: [hotel()] })).toBe(false);
    expect(validateHotelsBundle([{ ...hotel(), id: "" }])).toBe(false);
    expect(validateHotelsBundle([{ ...hotel(), name: "" }])).toBe(false);
    expect(validateHotelsBundle([{ ...hotel(), rooms: -1 }])).toBe(false);
    expect(validateHotelsBundle([{ ...hotel(), photos: [{ ...commonsPhoto, thumb: "https://evil.example/a.jpg" }] }])).toBe(false);
  });
});

describe("describeHotel", () => {
  test("shows the room count, postcode, and source", () => {
    expect(texts(describeHotel(hotel()))).toEqual([
      "Hotel Bencoolen",
      "Licensed hotel",
      "84 licensed rooms",
      "Singapore 189626",
      "Source: Hotels Licensing Board via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });

  test("omits missing rooms and credits Commons photos", () => {
    expect(texts(describeHotel(hotel({ rooms: null, address: null, photos: [commonsPhoto] })))).toEqual([
      "Hotel Bencoolen",
      "Licensed hotel",
      "Photo: Terence Ong (CC BY 2.5) · Wikimedia Commons",
      "Source: Hotels Licensing Board via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });
});

describe("hotel search results", () => {
  test("lands on the place with a searchable type", () => {
    expect(buildHotelSearchResults([hotel()])[0]).toMatchObject({ id: "hotel-19844", type: "hotel", lat: 1.2992, lng: 103.8501, zoom: 16 });
    expect(buildHotelSearchResults([hotel()])[0].keywords).toContain("hotel");
    expect(buildHotelSearchResults([hotel()])[0].keywords).toContain("84");
  });
});
