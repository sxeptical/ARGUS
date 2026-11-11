import { describe, expect, test } from "bun:test";
import { HAWKER_CENTRES, MALLS, validateAmenitiesBundle } from "@/lib/data/amenities";
import type { HawkerCentre, HawkerClosure, Mall, PlacePhoto } from "@/types";
import { describeHawkerCentre, describeHawkerClosure, describeMall, formatClosureRange, formatOpeningHours } from "@/lib/amenities";

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
  closures: [],
  ...overrides,
});

const closure = (overrides: Partial<HawkerClosure> = {}): HawkerClosure => ({
  kind: "cleaning",
  start: "2026-12-12",
  end: "2026-12-15",
  remarks: null,
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
  test("ships photos on most malls and hawker centres", () => {
    expect(MALLS.filter((m) => m.photos.length).length).toBeGreaterThan(40);
    expect(HAWKER_CENTRES.filter((h) => h.photos.length).length).toBeGreaterThan(90);
    // NEA's photo is only a fallback for centres without Commons photos.
    expect(HAWKER_CENTRES.every((h) => !h.photos.some((p) => p.source === "nea") || h.photos.length === 1)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateAmenitiesBundle({ hawkers: [hawker({ photos: [neaPhoto] })], malls: [mall({ photos: [commonsPhoto()] })] })).toBe(true);
    expect(validateAmenitiesBundle({ hawkers: [hawker({ status: "closed" as "open" })], malls: [] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [], malls: [{ ...mall(), stores: undefined }] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [hawker({ stalls: -1 })], malls: [] })).toBe(false);
    expect(validateAmenitiesBundle({ hawkers: [hawker({ expectedYear: 2027.5 })], malls: [] })).toBe(false);
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

describe("hawker closure lines", () => {
  test("formats single-day, same-month, cross-month and cross-year ranges", () => {
    expect(formatClosureRange("2026-12-12", "2026-12-12")).toBe("12 Dec");
    expect(formatClosureRange("2026-12-12", "2026-12-15")).toBe("12–15 Dec");
    expect(formatClosureRange("2026-12-28", "2027-01-02")).toBe("28 Dec 2026–2 Jan 2027");
    expect(formatClosureRange("2026-03-30", "2026-04-02")).toBe("30 Mar–2 Apr");
  });

  test("shows the current closure with its reopening date", () => {
    expect(describeHawkerClosure([closure()], "2026-12-13")).toEqual({
      current: true,
      text: "Closed now for cleaning until 15 Dec",
    });
    expect(describeHawkerClosure([closure({ kind: "other-works", remarks: "Repairs and Redecoration" })], "2026-12-15")).toEqual({
      current: true,
      text: "Closed now for other works until 15 Dec — Repairs and Redecoration",
    });
  });

  test("shows the next upcoming closure, and nothing when all are past", () => {
    expect(describeHawkerClosure([closure()], "2026-11-01")).toEqual({
      current: false,
      text: "Closed for cleaning 12–15 Dec",
    });
    expect(describeHawkerClosure([closure()], "2026-12-16")).toBeNull();
    expect(describeHawkerClosure([], "2026-12-13")).toBeNull();
  });

  test("prefers the earliest-ending current closure, then the soonest next", () => {
    const status = describeHawkerClosure(
      [
        closure({ start: "2026-12-01", end: "2026-12-31" }),
        closure({ start: "2026-12-10", end: "2026-12-12" }),
        closure({ start: "2026-12-20", end: "2026-12-21" }),
      ],
      "2026-12-11",
    );
    expect(status).toEqual({ current: true, text: "Closed now for cleaning until 12 Dec" });
    expect(describeHawkerClosure(
      [
        closure({ start: "2026-01-01", end: "2026-01-02" }),
        closure({ start: "2026-12-20", end: "2026-12-21" }),
        closure({ start: "2026-12-12", end: "2026-12-15" }),
      ],
      "2026-06-01",
    )).toEqual({ current: false, text: "Closed for cleaning 12–15 Dec" });
  });

  test("ignores inverted periods", () => {
    expect(describeHawkerClosure([closure({ start: "2026-12-15", end: "2026-12-12" })], "2026-12-13")).toBeNull();
  });

  test("surfaces the closure in the hawker popup lines", () => {
    const lines = describeHawkerCentre(hawker({ closures: [closure()] }), "2026-12-13");
    expect(texts(lines)).toContain("Closed now for cleaning until 15 Dec");
    expect(lines.find((line) => line.text.startsWith("Closed now"))?.tone).toBe("warning");
    expect(texts(describeHawkerCentre(hawker({ closures: [closure()] }), "2026-11-01"))).toContain("Closed for cleaning 12–15 Dec");
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
