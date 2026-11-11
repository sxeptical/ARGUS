import { describe, expect, test } from "bun:test";
import { validateHotelsBundle } from "@/lib/data/hotels";
import { describeHotel } from "@/lib/hotels";
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
  test("rejects malformed bundles", () => {
    expect(validateHotelsBundle([hotel()])).toBe(true);
    expect(validateHotelsBundle({ hotels: [hotel()] })).toBe(false);
    expect(validateHotelsBundle([{ ...hotel(), rooms: -1 }])).toBe(false);
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
