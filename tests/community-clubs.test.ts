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
  test("ships PA outlets in both kinds", () => {
    expect(COMMUNITY_CLUBS.filter((c) => c.kind === "community-club").length).toBeGreaterThan(100);
    expect(COMMUNITY_CLUBS.filter((c) => c.kind === "passionwave").length).toBeGreaterThan(0);
  });

  test("rejects malformed bundles", () => {
    expect(validateCommunityClubsBundle([club()])).toBe(true);
    expect(validateCommunityClubsBundle({ clubs: [club()] })).toBe(false);
    expect(validateCommunityClubsBundle([{ ...club(), kind: "nightclub" }])).toBe(false);
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
