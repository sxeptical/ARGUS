import { describe, expect, test } from "bun:test";
import { isPhotoFile, MAX_PHOTOS_PER_PLACE, photoYear, pickPhotos } from "../scripts/lib/commons-photos.mjs";

describe("isPhotoFile", () => {
  test("keeps photos of the place", () => {
    expect(isPhotoFile("File:VivoCity, Singapore 2026.jpg")).toBe(true);
    expect(isPhotoFile("File:Night at Singapore Botanic Gardens - entrance gate next to the MRT (2025) - img 01.jpg")).toBe(true);
  });

  test("drops non-photos and the infrastructure next door", () => {
    for (const title of [
      "File:VivoCity logo.jpg",
      "File:Level 2 floor plan.jpg",
      "File:Junction 10 LRT track.jpg",
      "File:Elevated MRT track running adjacent to Tampines Eco Green.jpg",
      "File:MacRitchie Reservoir bus stop 08-08-2025(1).jpg",
      "File:POPstation lockers and POPDrop kisok at Tiong Bahru Plaza - Aug 2025.jpg",
      "File:Bishan Park car park.jpg",
      "File:Bedok Mall.png",
    ]) {
      expect(isPhotoFile(title)).toBe(false);
    }
  });
});

type Info = { thumb: string; author: string; year: number | null };
const info = (thumb: string, author: string, year: number | null): Info => ({ thumb, author, year });

describe("photoYear", () => {
  const now = new Date("2026-11-06");

  test("reads the capture year from Commons' date shapes", () => {
    expect(photoYear("2024-05-12 14:03:22", now)).toBe(2024);
    expect(photoYear("12 May 2023", now)).toBe(2023);
    expect(photoYear('<time class="dtstart" datetime="2006-03-01">1 March 2006</time>', now)).toBe(2006);
  });

  test("returns null when missing or implausible", () => {
    expect(photoYear(undefined, now)).toBeNull();
    expect(photoYear("", now)).toBeNull();
    expect(photoYear("2031-01-01", now)).toBeNull();
    expect(photoYear("1890", now)).toBeNull();
  });
});

describe("pickPhotos", () => {
  test("puts the newest photos first and undated ones last", () => {
    const byTitle = new Map<string, Info>([
      ["File:Main.jpg", info("main", "A", 2006)],
      ["File:New.jpg", info("new", "B", 2025)],
      ["File:Undated.jpg", info("undated", "C", null)],
      ["File:Mid.jpg", info("mid", "D", 2019)],
    ]);
    const picked = pickPhotos(["File:Main.jpg", "File:Undated.jpg", "File:Mid.jpg", "File:New.jpg"], byTitle) as Info[];
    expect(picked.map((photo) => photo.thumb)).toEqual(["new", "mid", "main"].slice(0, MAX_PHOTOS_PER_PLACE));
  });

  const now = new Date("2026-11-06");

  test("prefers different recent photographers before a second shot from one", () => {
    const byTitle = new Map<string, Info>([
      ["File:A1.jpg", info("a1", "Alice", 2025)],
      ["File:A2.jpg", info("a2", "Alice", 2025)],
      ["File:A3.jpg", info("a3", "Alice", 2025)],
      ["File:B1.jpg", info("b1", "Bob", 2023)],
    ]);
    const picked = pickPhotos(["File:A1.jpg", "File:A2.jpg", "File:A3.jpg", "File:B1.jpg"], byTitle, now) as Info[];
    expect(picked.map((photo) => photo.thumb)).toEqual(["a1", "b1", "a2"]);
  });

  test("uses a second recent shot before an old photo from someone else", () => {
    const byTitle = new Map<string, Info>([
      ["File:New1.jpg", info("new1", "LN", 2024)],
      ["File:New2.jpg", info("new2", "LN", 2024)],
      ["File:Old.jpg", info("old", "Chong", 2013)],
      ["File:Older.jpg", info("older", "Sengkang", 2006)],
    ]);
    const picked = pickPhotos(["File:Old.jpg", "File:Older.jpg", "File:New1.jpg", "File:New2.jpg"], byTitle, now) as Info[];
    expect(picked.map((photo) => photo.thumb)).toEqual(["new1", "new2", "old"]);
  });

  test("keeps the given order among equal years and skips unresolved titles", () => {
    const byTitle = new Map<string, Info>([
      ["File:Wikidata main.jpg", info("main", "A", 2024)],
      ["File:Category.jpg", info("cat", "B", 2024)],
    ]);
    const picked = pickPhotos(["File:Missing.jpg", "File:Wikidata main.jpg", "File:Category.jpg"], byTitle) as Info[];
    expect(picked.map((photo) => photo.thumb)).toEqual(["main", "cat"]);
  });
});
