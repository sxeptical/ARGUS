import communityClubsData from "@/public/community-clubs.json";
import type { CommunityClub, CommunityClubKind } from "@/types";

const COMMUNITY_CLUB_KINDS: ReadonlySet<string> = new Set([
  "community-club",
  "passionwave",
]);

const isCommunityClub = (value: unknown): value is CommunityClub => {
  const club = value as Partial<CommunityClub> | null;
  return (
    typeof club?.id === "string" &&
    club.id.length > 0 &&
    typeof club.name === "string" &&
    club.name.length > 0 &&
    typeof club.kind === "string" &&
    COMMUNITY_CLUB_KINDS.has(club.kind) &&
    (club.address === null || typeof club.address === "string") &&
    Number.isFinite(club.lat) &&
    Number.isFinite(club.lng)
  );
};

export function validateCommunityClubsBundle(value: unknown): value is CommunityClub[] {
  return Array.isArray(value) && value.every(isCommunityClub);
}

// Built by scripts/fetch-community-clubs.mjs; see that script for sources/licences.
if (!validateCommunityClubsBundle(communityClubsData))
  throw new Error("Invalid community clubs bundle");
const COMMUNITY_CLUBS = communityClubsData as CommunityClub[];
export { COMMUNITY_CLUBS };
export type { CommunityClubKind };
