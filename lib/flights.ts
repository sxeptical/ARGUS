import { distanceM } from "@/lib/geo-filter";
import type { FlightState } from "@/types";

const CHANGI_LNG_LAT: readonly [number, number] = [103.9915, 1.3644];

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE",
  "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW",
  "W", "WNW", "NW", "NNW",
] as const;

/** Common 3-letter ICAO callsign prefixes observed in Singapore airspace. */
const AIRLINE_BY_ICAO: Readonly<Record<string, string>> = {
  AAR: "Asiana Airlines",
  AFR: "Air France",
  AIC: "Air India",
  ANA: "All Nippon Airways",
  ANZ: "Air New Zealand",
  AWQ: "Indonesia AirAsia",
  AXM: "AirAsia",
  BAW: "British Airways",
  BTK: "Batik Air",
  CAL: "China Airlines",
  CCA: "Air China",
  CEB: "Cebu Pacific",
  CES: "China Eastern",
  CHH: "Hainan Airlines",
  CLX: "Cargolux",
  CPA: "Cathay Pacific",
  CQH: "Spring Airlines",
  CSN: "China Southern",
  CTV: "Citilink",
  CXA: "XiamenAir",
  DLH: "Lufthansa",
  ETD: "Etihad Airways",
  EVA: "EVA Air",
  FDX: "FedEx Express",
  FFM: "Firefly",
  FIN: "Finnair",
  GIA: "Garuda Indonesia",
  HVN: "Vietnam Airlines",
  IGO: "IndiGo",
  JAL: "Japan Airlines",
  JSA: "Jetstar Asia",
  JST: "Jetstar",
  KAL: "Korean Air",
  KLM: "KLM",
  LNI: "Lion Air",
  MAS: "Malaysia Airlines",
  MXD: "Batik Air Malaysia",
  PAL: "Philippine Airlines",
  QFA: "Qantas",
  QTR: "Qatar Airways",
  SIA: "Singapore Airlines",
  SJV: "Super Air Jet",
  SQC: "Singapore Airlines Cargo",
  SWR: "SWISS",
  TGW: "Scoot",
  THA: "Thai Airways",
  THY: "Turkish Airlines",
  UAE: "Emirates",
  UAL: "United Airlines",
  UPS: "UPS Airlines",
  VJC: "VietJet Air",
};

const CATEGORY_LABEL: Readonly<Record<string, string>> = {
  A1: "Light",
  A2: "Small",
  A3: "Large",
  A4: "High Vortex",
  A5: "Heavy",
  A6: "High Performance",
  A7: "Rotorcraft",
  B1: "Glider",
  B2: "Lighter-than-air",
  B4: "Ultralight",
  B6: "UAV",
};

export function summarizeFlights(flights: readonly FlightState[]) {
  return flights.reduce(
    (summary, flight) => {
      summary[flight.direction] += 1;
      return summary;
    },
    { inbound: 0, outbound: 0, transit: 0 },
  );
}

/** Infer an airline name from a 3-letter ICAO callsign prefix (e.g. SIA321 -> Singapore Airlines). */
export function airlineFromCallsign(callsign: string): string | null {
  const match = /^([A-Z]{3})\d/.exec(callsign.trim().toUpperCase());
  if (!match) return null;
  return AIRLINE_BY_ICAO[match[1]] ?? null;
}

export function describeAircraftCategory(code?: string | null): string | null {
  if (!code) return null;
  return CATEGORY_LABEL[code.trim().toUpperCase()] ?? null;
}

export function compassDirection(degrees: number): string {
  const normalized = ((degrees % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 22.5) % 16];
}

export function formatFlightAltitude(altitudeM: number | null | undefined): string {
  if (altitudeM === null || altitudeM === undefined || !Number.isFinite(altitudeM)) {
    return "N/A";
  }
  const feet = Math.round(altitudeM * 3.28084);
  if (feet >= 18_000) {
    const fl = Math.round(feet / 100);
    return `${feet.toLocaleString()} ft (FL${fl})`;
  }
  return `${feet.toLocaleString()} ft`;
}

export function formatFlightSpeed(
  velocityMps: number | null | undefined,
  mach?: number | null,
): string {
  if (velocityMps === null || velocityMps === undefined || !Number.isFinite(velocityMps)) {
    return "N/A";
  }
  const kmh = Math.round(velocityMps * 3.6);
  const knots = Math.round(velocityMps / 0.514444);
  const parts = [`${kmh} km/h`, `${knots} kt`];
  if (typeof mach === "number" && Number.isFinite(mach) && mach > 0.2) {
    parts.push(`M${mach.toFixed(2)}`);
  }
  return parts.join(" · ");
}

export function formatVerticalRate(verticalRateMps: number | null | undefined): string {
  if (
    verticalRateMps === null ||
    verticalRateMps === undefined ||
    !Number.isFinite(verticalRateMps)
  ) {
    return "N/A";
  }
  const fpm = Math.round(verticalRateMps * 196.8504);
  if (Math.abs(fpm) < 64) return "Level";
  const sign = fpm > 0 ? "+" : "";
  const trend = fpm > 0 ? "Climbing" : "Descending";
  return `${sign}${fpm.toLocaleString()} ft/min · ${trend}`;
}

export function formatFlightTrack(track: number | null | undefined): string {
  if (track === null || track === undefined || !Number.isFinite(track)) {
    return "N/A";
  }
  const rounded = Math.round(((track % 360) + 360) % 360);
  return `${rounded}° ${compassDirection(rounded)}`;
}

export function formatDistanceFromChangi(lat: number, lng: number): string {
  const metres = distanceM(CHANGI_LNG_LAT, [lng, lat]);
  if (metres < 1_000) return "<1 km from Changi";
  const km = metres >= 10_000 ? Math.round(metres / 1_000) : Number((metres / 1_000).toFixed(1));
  const dLon = ((lng - CHANGI_LNG_LAT[0]) * Math.PI) / 180;
  const fromLat = (CHANGI_LNG_LAT[1] * Math.PI) / 180;
  const toLat = (lat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return `${km} km ${compassDirection(bearing)} of Changi`;
}

export function describeSquawk(squawk?: string | null): string | null {
  const code = squawk?.trim();
  if (!code) return null;
  if (code === "7700") return "7700 (General emergency)";
  if (code === "7600") return "7600 (Radio failure)";
  if (code === "7500") return "7500 (Unlawful interference)";
  return code;
}

export function adsbGlobeUrl(icao24: string): string {
  return `https://globe.adsb.lol/?icao=${encodeURIComponent(icao24.trim().toLowerCase())}`;
}
