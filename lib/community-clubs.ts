/**
 * Popup copy for the static community-club layer. Pure so
 * the map and tests share one definition.
 */
import { photoCredit } from "@/lib/amenities";
import type { PopupLine } from "@/lib/mobility";
import type { CommunityClub, CommunityClubKind } from "@/types";

export const COMMUNITY_CLUB_KIND_LABEL: Record<CommunityClubKind, string> = {
  "community-club": "Community club",
  passionwave: "PAssion WaVe outlet",
};

export const COMMUNITY_CLUB_SOURCE_HINT =
  "Source: People's Association via data.gov.sg (Singapore Open Data Licence)";

export const describeCommunityClub = (club: CommunityClub): PopupLine[] => {
  const credit = photoCredit(club.photos);
  return [
    { text: club.name, kind: "name" },
    { text: COMMUNITY_CLUB_KIND_LABEL[club.kind], kind: "status", tone: "muted" },
    ...(club.address ? [{ text: club.address, kind: "detail" as const }] : []),
    ...(credit ? [{ text: credit, kind: "hint" as const }] : []),
    { text: COMMUNITY_CLUB_SOURCE_HINT, kind: "hint" },
  ];
};
