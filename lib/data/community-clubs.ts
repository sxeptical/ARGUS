import communityClubsData from "@/public/community-clubs.json";
import { isAddressedPlace, isOneOf, isPhotoList } from "@/lib/bundle-validation";
import type { CommunityClub } from "@/types";

const isCommunityClub = (value: unknown): value is CommunityClub => {
  const club = value as Partial<CommunityClub>;
  return (
    isAddressedPlace(value) &&
    isOneOf(["community-club", "passionwave"], club.kind) &&
    isPhotoList(club.photos)
  );
};

export function validateCommunityClubsBundle(value: unknown): value is CommunityClub[] {
  return Array.isArray(value) && value.every(isCommunityClub);
}

// Built by scripts/fetch-community-clubs.mjs; see that script for sources/licences.
if (!validateCommunityClubsBundle(communityClubsData))
  throw new Error("Invalid community clubs bundle");
export const COMMUNITY_CLUBS = communityClubsData as CommunityClub[];
