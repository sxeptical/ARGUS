/**
 * Popup copy and search entries for the static community-club layer. Pure so
 * the map and tests share one definition.
 */
import type { PopupLine } from "@/lib/mobility";
import type { CommunityClub, CommunityClubKind, MapSearchResult } from "@/types";

export const COMMUNITY_CLUB_KIND_LABEL: Record<CommunityClubKind, string> = {
  "community-club": "Community club",
  passionwave: "PAssion WaVe outlet",
};

export const COMMUNITY_CLUB_SOURCE_HINT =
  "Source: People's Association via data.gov.sg (Singapore Open Data Licence)";

export const describeCommunityClub = (club: CommunityClub): PopupLine[] => [
  { text: club.name, kind: "name" },
  { text: COMMUNITY_CLUB_KIND_LABEL[club.kind], kind: "status", tone: "muted" },
  ...(club.address ? [{ text: club.address, kind: "detail" as const }] : []),
  { text: COMMUNITY_CLUB_SOURCE_HINT, kind: "hint" },
];

export const buildCommunityClubSearchResults = (clubs: ReadonlyArray<CommunityClub>): MapSearchResult[] =>
  clubs.map((club) => ({
    id: club.id,
    type: "community-club",
    name: club.name,
    lat: club.lat,
    lng: club.lng,
    zoom: 16,
    keywords: [
      "community club",
      "PA",
      COMMUNITY_CLUB_KIND_LABEL[club.kind],
      ...(club.address ? [club.address] : []),
    ],
  }));
