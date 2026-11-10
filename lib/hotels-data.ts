import hotelsData from "@/public/hotels.json";
import { isPhotoList } from "@/lib/amenities-data";
import type { Hotel } from "@/types";

const isHotel = (value: unknown): value is Hotel => {
  const hotel = value as Partial<Hotel> | null;
  return (
    typeof hotel?.id === "string" &&
    hotel.id.length > 0 &&
    typeof hotel.name === "string" &&
    hotel.name.length > 0 &&
    (hotel.address === null || typeof hotel.address === "string") &&
    (hotel.rooms === null || (typeof hotel.rooms === "number" && Number.isInteger(hotel.rooms) && hotel.rooms > 0)) &&
    Number.isFinite(hotel.lat) &&
    Number.isFinite(hotel.lng) &&
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
const HOTELS = hotelsData as Hotel[];
export { HOTELS };
