import { describe, expect, test } from "bun:test";
import { COMMUNITY_CLUBS, validateCommunityClubsBundle } from "@/lib/data/community-clubs";
import { describeCommunityClub } from "@/lib/community-clubs";
import type { CommunityClub } from "@/types";

const club = (overrides: Partial<CommunityClub> = {}): CommunityClub => ({
  id: "cc-5045",
  name: "Punggol 21 CC",
  kind: "community-club",
  address: "80 Punggol Field, Singapore 828815",
  lat: 1.3936,
  lng: 103.9135,
  photos: [],
  ...overrides,
});

const commonsPhoto: CommunityClub["photos"][number] = {
  thumb: "https://thumb.wikimedia.org/a.jpg",
  page: "https://commons.wikimedia.org/wiki/File:A.jpg",
  author: "Terence Ong",
  license: "CC BY 2.5",
  source: "commons",
};

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("community clubs bundle", () => {
  test("ships plausible Singapore PA outlets in both kinds", () => {
    expect(COMMUNITY_CLUBS.length).toBeGreaterThan(120);
    for (const place of COMMUNITY_CLUBS) {
      expect(place.lng).toBeGreaterThanOrEqual(103.5);
      expect(place.lng).toBeLessThanOrEqual(104.1);
      expect(place.lat).toBeGreaterThanOrEqual(1.1);
      expect(place.lat).toBeLessThanOrEqual(1.5);
      expect(place.name.length).toBeGreaterThan(0);
    }
    expect(new Set(COMMUNITY_CLUBS.map((c) => c.id)).size).toBe(COMMUNITY_CLUBS.length);
    expect(COMMUNITY_CLUBS.filter((c) => c.kind === "community-club").length).toBeGreaterThan(100);
    expect(COMMUNITY_CLUBS.filter((c) => c.kind === "passionwave").length).toBeGreaterThan(0);
    // Most clubs have no Commons photos; the pipeline must never invent any.
    expect(COMMUNITY_CLUBS.every((c) => c.photos.length <= 3)).toBe(true);
    for (const photo of COMMUNITY_CLUBS.flatMap((c) => c.photos)) {
      expect(photo.thumb).toMatch(/^https:\/\/(upload|thumb)\.wikimedia\.org\//);
      expect(photo.license?.length).toBeGreaterThan(0);
      expect(photo.author.length).toBeGreaterThan(0);
    }
  });

  test("rejects malformed bundles", () => {
    expect(validateCommunityClubsBundle([club()])).toBe(true);
    expect(validateCommunityClubsBundle({ clubs: [club()] })).toBe(false);
    expect(validateCommunityClubsBundle([{ ...club(), kind: "nightclub" }])).toBe(false);
    expect(validateCommunityClubsBundle([{ ...club(), id: "" }])).toBe(false);
    expect(validateCommunityClubsBundle([{ ...club(), name: "" }])).toBe(false);
    expect(validateCommunityClubsBundle([{ ...club(), lat: Number.NaN }])).toBe(false);
    expect(validateCommunityClubsBundle([{ ...club(), photos: [{ ...commonsPhoto, thumb: "https://evil.example/a.jpg" }] }])).toBe(false);
  });
});

describe("describeCommunityClub", () => {
  test("shows the kind, address, and source", () => {
    expect(texts(describeCommunityClub(club()))).toEqual([
      "Punggol 21 CC",
      "Community club",
      "80 Punggol Field, Singapore 828815",
      "Source: People's Association via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });

  test("labels PAssion WaVe outlets", () => {
    expect(texts(describeCommunityClub(club({ kind: "passionwave", name: "PAssion WaVe", address: null })))).toEqual([
      "PAssion WaVe",
      "PAssion WaVe outlet",
      "Source: People's Association via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });

  test("credits Commons photos", () => {
    expect(texts(describeCommunityClub(club({ photos: [commonsPhoto] })))).toContain("Photo: Terence Ong (CC BY 2.5) · Wikimedia Commons");
  });
});
