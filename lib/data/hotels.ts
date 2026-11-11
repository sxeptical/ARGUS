import hotelsData from "@/public/hotels.json";
import { isAddressedPlace, isPhotoList } from "@/lib/bundle-validation";
import type { Hotel } from "@/types";

const isHotel = (value: unknown): value is Hotel => {
  const hotel = value as Partial<Hotel>;
  return (
    isAddressedPlace(value) &&
    (hotel.rooms === null || (typeof hotel.rooms === "number" && Number.isInteger(hotel.rooms) && hotel.rooms > 0)) &&
    isPhotoList(hotel.photos)
  );
};

export function validateHotelsBundle(value: unknown): value is Hotel[] {
  return Array.isArray(value) && value.every(isHotel);
}

// Built by scripts/fetch-hotels.mjs; see that script for sources/licences.
// It intentionally omits KEEPERNAME (licensee personal names) and HYPERLINK
// (an email/contact string, not a website URL).
if (!validateHotelsBundle(hotelsData))
  throw new Error("Invalid hotels bundle");
export const HOTELS: Hotel[] = hotelsData;
