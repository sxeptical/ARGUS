import { describe, expect, test } from "bun:test";
import { HAWKER_CENTRES, MALLS, validateAmenitiesBundle } from "@/lib/amenities-data";
import type { HawkerCentre, Mall, PlacePhoto } from "@/types";
import { buildHawkerSearchResults, buildMallSearchResults, describeHawkerCentre, describeMall, formatOpeningHours } from "./amenities";

const commonsPhoto = (overrides: Partial<PlacePhoto> = {}): PlacePhoto => ({
  thumb: "https://thumb.wikimedia.org/a.jpg",
  page: "https://commons.wikimedia.org/wiki/File:A.jpg",
  author: "Terence Ong",
  license: "CC BY 2.5",
  source: "commons",
  ...overrides,
});
const neaPhoto: PlacePhoto = { thumb: "https://www.nea.gov.sg/images/a.jpg", page: null, author: "NEA", license: null, source: "nea" };

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

const hawker = (overrides: Partial<HawkerCentre> = {}): HawkerCentre => ({
  id: "hawker-1",
  name: "Adam Road Food Centre",
  address: "2, Adam Road, Singapore 289876",
  lat: 1.324,
  lng: 103.814,
  stalls: 32,
  status: "open",
  expectedYear: null,
  photos: [],
  ...overrides,
});

const mall = (overrides: Partial<Mall> = {}): Mall => ({
  id: "osm-way-1",
  name: "ION Orchard",
  address: "2 Orchard Turn, Singapore 238801",
  lat: 1.304,
  lng: 103.832,
  openingHours: "Mo-Su 10:00-22:00",
  stores: 278,
  fnb: 67,
  nearestMrt: "Orchard (NS22/TE14)",
  photos: [],
  ...overrides,
});

describe("amenities bundle", () => {
  test("ships plausible Singapore malls and hawker centres", () => {
    expect(HAWKER_CENTRES.length).toBeGreaterThan(100);
    expect(MALLS.length).toBeGreaterThan(150);
    for (const place of [...HAWKER_CENTRES, ...MALLS]) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
    }
    expect(new Set(MALLS.map((m) => m.id)).size).toBe(MALLS.length);
    expect(new Set(HAWKER_CENTRES.map((h) => h.id)).size).toBe(HAWKER_CENTRES.length);
  });

  test("only ships credited photos from the allowed hosts", () => {
    const places = [...MALLS, ...HAWKER_CENTRES];
    const photos = places.flatMap((place) => place.photos);
    expect(MALLS.filter((m) => m.photos.length).length).toBeGreaterThan(40);
    expect(HAWKER_CENTRES.filter((h) => h.photos.length).length).toBeGreaterThan(90);
    for (const photo of photos) {
      expect(photo.thumb).not.toContain("utm_");
      expect(photo.author.length).toBeGreaterThan(0);
      if (photo.source === "commons") {
        expect(photo.thumb).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
        expect(photo.license?.length).toBeGreaterThan(0);
      } else {
        expect(photo.thumb).toMatch(/^https:\/\/www\.nea\.gov\.sg\//);
      }
    }
    expect(places.every((place) => place.photos.length <= 3)).toBe(true);
    // NEA's photo is only a fallback for centres without Commons photos.
    expect(HAWKER_CENTRES.every((h) => !h.photos.some((p) => p.source === "nea") || h.photos.length === 1)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateAmenitiesBundle({ hawkers: [], malls: [mall({ photos: [commonsPhoto({ thumb: "https://evil.example/a.jpg" })] })] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [], malls: [mall({ photos: [commonsPhoto({ license: null })] })] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [hawker({ photos: [{ ...neaPhoto, thumb: "https://www.nea.gov.sg.evil.example/a.jpg" }] })], malls: [] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [hawker({ photos: [neaPhoto] })], malls: [mall({ photos: [commonsPhoto()] })] })).toBe(true);
    expect(validateAmenitiesBundle({ hawkers: [hawker({ status: "closed" as "open" })], malls: [] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [], malls: [{ id: "x", name: "", lat: 1, lng: 103 }] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [hawker()], malls: [mall()] })).toBe(true);
  });
});

describe("formatOpeningHours", () => {
  test("rewrites common OpenStreetMap shapes in plain English", () => {
    expect(formatOpeningHours("Mo-Su 10:00-22:00")).toBe("Daily 10:00–22:00");
    expect(formatOpeningHours("Mo-Su,PH 10:00 - 22:00")).toBe("Daily 10:00–22:00");
    expect(formatOpeningHours("10:00-21:30")).toBe("Daily 10:00–21:30");
    expect(formatOpeningHours("24/7")).toBe("Open 24 hours");
    expect(formatOpeningHours("Mo-Su,PH 00:00-24:00")).toBe("Open 24 hours");
    expect(formatOpeningHours("Su-Th 10:00-22:00; Fr-Sa 10:00-23:00")).toBe("Sun-Thu 10:00–22:00, Fri-Sat 10:00–23:00");
    expect(formatOpeningHours("off")).toBeNull();
  });
});

describe("describeHawkerCentre", () => {
  test("shows status, stall count, and address", () => {
    expect(texts(describeHawkerCentre(hawker()))).toEqual([
      "Adam Road Food Centre",
      "In operation",
      "32 cooked food stalls",
      "2, Adam Road, Singapore 289876",
      "Source: NEA via data.gov.sg",
    ]);
    expect(describeHawkerCentre(hawker({ status: "planned", expectedYear: 2027, stalls: null }))[1]).toEqual({
      text: "Under construction · expected 2027",
      kind: "status",
      tone: "muted",
    });
  });
});

describe("hawker photo credits", () => {
  test("credits Commons photographers or NEA", () => {
    expect(texts(describeHawkerCentre(hawker({ photos: [commonsPhoto()] })))).toContain("Photo: Terence Ong (CC BY 2.5) · Wikimedia Commons");
    expect(texts(describeHawkerCentre(hawker({ photos: [neaPhoto] })))).toContain("Photo: NEA");
    expect(texts(describeHawkerCentre(hawker())).some((text) => text.startsWith("Photo"))).toBe(false);
  });
});

describe("describeMall", () => {
  test("includes curated shop data when available", () => {
    expect(texts(describeMall(mall()))).toEqual([
      "ION Orchard",
      "278 shops · 67 food & drink",
      "Nearest MRT: Orchard (NS22/TE14)",
      "Daily 10:00–22:00",
      "2 Orchard Turn, Singapore 238801",
      "Shops: curioputterings/singapore-mall-data · Location: © OpenStreetMap",
    ]);
  });

  test("credits each photo's author once, grouped by licence", () => {
    const photo = commonsPhoto();
    const lines = describeMall(mall({ photos: [photo, { ...photo, author: "LN9267" }, photo, { ...photo, author: "Sengkang", license: "CC BY-SA 4.0" }] }));
    expect(lines.at(-2)).toEqual({ text: "Photos: Terence Ong, LN9267 (CC BY 2.5); Sengkang (CC BY-SA 4.0) · Wikimedia Commons", kind: "hint" });
  });

  test("falls back to location-only details", () => {
    expect(texts(describeMall(mall({ stores: null, fnb: null, nearestMrt: null, openingHours: "off", address: null })))).toEqual([
      "ION Orchard",
      "Location: © OpenStreetMap contributors",
    ]);
  });
});

describe("amenity search results", () => {
  test("lands on the place with a searchable type", () => {
    expect(buildMallSearchResults([mall()])[0]).toMatchObject({ id: "osm-way-1", type: "mall", lat: 1.304, lng: 103.832, zoom: 16 });
    expect(buildHawkerSearchResults([hawker()])[0].keywords).toContain("hawker");
  });
});
