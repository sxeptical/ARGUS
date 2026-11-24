/**
 * Singapore airspace flights via ADS-B v2 (adsb.lol primary, airplanes.live
 * secondary), with AviationStack, OpenSky, and last-good snapshot fallbacks.
 * Snapshot reads never overwrite cached data.
 */
import { cache } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import { airlineFromCallsign } from "@/lib/flights";
import { getFlightRoute } from "./flight-route";
import {
  AirplanesLiveResponseSchema,
  AviationStackResponseSchema,
  OpenSkyResponseSchema,
} from "@/types/schemas";
import type {
  AirplanesLiveAircraft,
  AviationStackFlight,
} from "@/types/schemas";
import type { FlightDirection, FlightState } from "@/types";
import { httpGetJson } from "./http";

const ADSB_LOL_BASE_URL = "https://api.adsb.lol/v2";
const AIRPLANES_LIVE_BASE_URL = "https://api.airplanes.live/v2";
const ADSB_RADIUS_NM = 35;
const AVIATIONSTACK_BASE_URL = "https://api.aviationstack.com/v1";
const OPENSKY_BASE_URL = "https://opensky-network.org/api";
const FLIGHT_TIMEOUT_MS = 6_000;
const FLIGHTS_CACHE_TTL_MS = 15_000;
const FLIGHTS_FALLBACK_KEY = "flights-sg-fallback";
const FLIGHTS_FALLBACK_MAX_AGE_MS = 10 * 60 * 1000;
const FEET_TO_METERS = 0.3048;
const KNOTS_TO_MPS = 0.514444;
const FPM_TO_MPS = 0.00508;
/** Unverified flights above FL240 within 35 nm of Changi are cruising overflights. */
const MAX_UNVERIFIED_ALTITUDE_M = 24_000 * FEET_TO_METERS;
const SG_BOUNDS = {
  lamin: 1.15,
  lomin: 103.45,
  lamax: 1.5,
  lomax: 104.15,
};
const CHANGI_COORDS = { lat: 1.3644, lon: 103.9915 };
const SG_AIRPORT_ICAO = new Set(["WSSS", "WSSL"]);
const SG_AIRPORT_IATA = new Set(["SIN", "XSP"]);

const getAviationStackApiKey = (): string => {
  const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
  if (!apiKey || apiKey.toLowerCase().includes("your_aviationstack_key")) {
    throw new ExternalApiError({
      service: "aviationstack",
      message: "Missing AVIATIONSTACK_API_KEY",
      status: 401,
    });
  }
  return apiKey;
};

/** `[]` when a provider is unavailable; timeouts and bad payloads propagate. */
const emptyOnExternalApiError = (error: unknown): FlightState[] => {
  if (error instanceof ExternalApiError) return [];
  throw error;
};

// ---------- Direction classification ----------

const bearingDegrees = (
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
): number => {
  const fromLatRad = (fromLat * Math.PI) / 180;
  const fromLonRad = (fromLon * Math.PI) / 180;
  const toLatRad = (toLat * Math.PI) / 180;
  const toLonRad = (toLon * Math.PI) / 180;

  const dLon = toLonRad - fromLonRad;
  const y = Math.sin(dLon) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
};

const classifyFlightDirection = (
  latitude: number,
  longitude: number,
  track: number | null,
): FlightDirection => {
  if (track === null) return "transit";
  const headingToChangi = bearingDegrees(
    latitude,
    longitude,
    CHANGI_COORDS.lat,
    CHANGI_COORDS.lon,
  );
  const diff = Math.abs(track - headingToChangi);
  const normalized = diff > 180 ? 360 - diff : diff;
  if (normalized <= 55) return "inbound";
  if (normalized >= 125) return "outbound";
  return "transit";
};

const normalizeCode = (code?: string | null): string =>
  (code ?? "").trim().toUpperCase();

const isSingaporeAirport = (
  icao?: string | null,
  iata?: string | null,
): boolean =>
  SG_AIRPORT_ICAO.has(normalizeCode(icao)) ||
  SG_AIRPORT_IATA.has(normalizeCode(iata));

// ---------- airplanes.live (primary) ----------

const toFlightStateFromAirplanesLive = (
  ac: AirplanesLiveAircraft,
  nowMs: number | null,
): FlightState | null => {
  const icao24 = (ac.hex ?? "").trim().replace(/^~/, "").toUpperCase();
  const latitude = ac.lat;
  const longitude = ac.lon;
  const onGround = ac.alt_baro === "ground";

  if (
    !icao24 ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    onGround
  ) {
    return null;
  }

  const flightLatitude = latitude as number;
  const flightLongitude = longitude as number;
  const flightTrack = Number.isFinite(ac.track) ? (ac.track as number) : null;
  const direction = classifyFlightDirection(
    flightLatitude,
    flightLongitude,
    flightTrack,
  );

  // airplanes.live reports altitude in ft, ground speed in knots, and vertical
  // rate in ft/min; normalize all to SI units expected by FlightState.
  const altitudeFeet =
    typeof ac.alt_baro === "number" && Number.isFinite(ac.alt_baro)
      ? ac.alt_baro
      : Number.isFinite(ac.alt_geom)
        ? (ac.alt_geom as number)
        : null;
  const altitude = altitudeFeet !== null ? altitudeFeet * FEET_TO_METERS : null;
  const velocity = Number.isFinite(ac.gs)
    ? (ac.gs as number) * KNOTS_TO_MPS
    : null;
  const verticalRateFpm = Number.isFinite(ac.baro_rate)
    ? (ac.baro_rate as number)
    : Number.isFinite(ac.geom_rate)
      ? (ac.geom_rate as number)
      : null;
  const verticalRate =
    verticalRateFpm !== null ? verticalRateFpm * FPM_TO_MPS : null;

  const seenSeconds = Number.isFinite(ac.seen) ? (ac.seen as number) : 0;
  const lastContact =
    nowMs !== null && Number.isFinite(nowMs)
      ? Math.floor(nowMs / 1000 - seenSeconds)
      : null;

  const registration = ac.r?.trim() || "";
  const aircraftType = ac.t?.trim() || "";
  const aircraftDesc = ac.desc?.trim() || "";
  const callsign = ac.flight?.trim() || registration || icao24;
  const operator = ac.ownOp?.trim() || airlineFromCallsign(callsign) || null;
  const originCountry =
    operator ||
    [aircraftType, registration].filter(Boolean).join(" · ") ||
    aircraftDesc ||
    "ADS-B";
  const selectedAltitude = Number.isFinite(ac.nav_altitude_mcp)
    ? (ac.nav_altitude_mcp as number) * FEET_TO_METERS
    : null;
  const emergency =
    ac.emergency && ac.emergency !== "none" ? ac.emergency.trim() : null;

  return {
    id: icao24,
    icao24,
    callsign,
    originCountry,
    latitude: flightLatitude,
    longitude: flightLongitude,
    altitude,
    velocity,
    track: flightTrack,
    verticalRate,
    onGround,
    direction,
    lastContact,
    registration: registration || null,
    aircraftType: aircraftType || null,
    aircraftDesc: aircraftDesc || null,
    operator,
    category: ac.category?.trim() || null,
    squawk: ac.squawk?.trim() || null,
    emergency,
    mach: Number.isFinite(ac.mach) ? (ac.mach as number) : null,
    selectedAltitude,
  };
};

const fetchFlightsFromAdsbV2 = async (
  service: string,
  baseUrl: string,
): Promise<FlightState[]> => {
  const url = `${baseUrl}/point/${CHANGI_COORDS.lat}/${CHANGI_COORDS.lon}/${ADSB_RADIUS_NM}`;
  const response = await httpGetJson(
    service,
    url,
    { Accept: "application/json" },
    AirplanesLiveResponseSchema,
    FLIGHT_TIMEOUT_MS,
  );
  const nowMs = Number.isFinite(response.now) ? (response.now as number) : null;
  const deduped = new Map<string, FlightState>();
  for (const item of response.ac ?? []) {
    const flight = toFlightStateFromAirplanesLive(item, nowMs);
    if (!flight) continue;
    const existing = deduped.get(flight.icao24);
    const existingTs = existing?.lastContact ?? 0;
    const currentTs = flight.lastContact ?? 0;
    if (!existing || currentTs >= existingTs) {
      deduped.set(flight.icao24, flight);
    }
  }
  return [...deduped.values()];
};

// ---------- AviationStack (fallback) ----------

const toFlightStateFromAviationStack = (
  item: AviationStackFlight,
): FlightState | null => {
  const live = item?.live;
  const latitude = live?.latitude;
  const longitude = live?.longitude;
  const onGround = live?.is_ground ?? false;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || onGround) {
    return null;
  }

  const flightLatitude = latitude as number;
  const flightLongitude = longitude as number;
  const flightTrack = Number.isFinite(live?.direction)
    ? (live?.direction as number)
    : null;

  const dep = item?.departure;
  const arr = item?.arrival;
  const depIsSingapore = isSingaporeAirport(dep?.icao, dep?.iata);
  const arrIsSingapore = isSingaporeAirport(arr?.icao, arr?.iata);
  const direction: FlightDirection =
    arrIsSingapore && !depIsSingapore
      ? "inbound"
      : depIsSingapore && !arrIsSingapore
        ? "outbound"
        : classifyFlightDirection(flightLatitude, flightLongitude, flightTrack);

  const flight = item?.flight;
  const airline = item?.airline;
  const aircraft = item?.aircraft;

  const flightCode =
    flight?.icao?.trim() ||
    flight?.iata?.trim() ||
    `${airline?.iata?.trim() ?? ""}${flight?.number?.trim() ?? ""}`.trim();
  const icao24 =
    aircraft?.icao24?.trim() ||
    aircraft?.registration?.trim() ||
    flightCode ||
    "unknown";
  const callsign = flightCode || icao24.toUpperCase();

  // AviationStack reports horizontal/vertical speed in km/h; normalize to m/s.
  const velocityKmh = live?.speed_horizontal;
  const verticalKmh = live?.speed_vertical;
  const velocity = Number.isFinite(velocityKmh)
    ? (velocityKmh as number) / 3.6
    : null;
  const verticalRate = Number.isFinite(verticalKmh)
    ? (verticalKmh as number) / 3.6
    : null;
  const altitude = Number.isFinite(live?.altitude)
    ? (live?.altitude as number)
    : null;
  const lastContactMs = live?.updated ? Date.parse(live.updated) : Number.NaN;
  const lastContact = Number.isFinite(lastContactMs)
    ? Math.floor(lastContactMs / 1000)
    : null;

  return {
    // Keep feature identity stable across provider refreshes.
    id: icao24,
    icao24,
    callsign,
    originCountry:
      item?.departure?.airport?.trim() || airline?.name?.trim() || "Unknown",
    latitude: flightLatitude,
    longitude: flightLongitude,
    altitude,
    velocity,
    track: flightTrack,
    verticalRate,
    onGround,
    direction,
    lastContact,
    departureAirport: dep?.iata?.trim() || dep?.icao?.trim() || dep?.airport?.trim() || null,
    arrivalAirport: arr?.iata?.trim() || arr?.icao?.trim() || arr?.airport?.trim() || null,
  };
};

const fetchAviationStackEndpoint = async (
  apiKey: string,
  filter: Record<string, string>,
): Promise<AviationStackFlight[]> => {
  const params = new URLSearchParams({
    access_key: apiKey,
    limit: "100",
    ...filter,
  });
  const response = await httpGetJson(
    "aviationstack",
    `${AVIATIONSTACK_BASE_URL}/flights?${params.toString()}`,
    { Accept: "application/json" },
    AviationStackResponseSchema,
    FLIGHT_TIMEOUT_MS,
  );
  if (response.error) {
    throw new ExternalApiError({
      service: "aviationstack",
      message: `Aviationstack error${
        response.error.code ? ` ${response.error.code}` : ""
      }: ${response.error.info ?? response.error.type ?? "unknown"}`,
      status: 502,
    });
  }
  return response.data ?? [];
};

const fetchFlightsFromAviationStack = async (): Promise<FlightState[]> => {
  const apiKey = getAviationStackApiKey();
  // Endpoints fail independently; only all of them failing is an error.
  const filters: Array<Record<string, string>> = [
    { dep_icao: "WSSS" },
    { arr_icao: "WSSS" },
    { dep_icao: "WSSL" },
    { arr_icao: "WSSL" },
  ];
  const batches = await Promise.allSettled(
    filters.map((filter) => fetchAviationStackEndpoint(apiKey, filter)),
  );

  const succeeded = batches.flatMap((batch) =>
    batch.status === "fulfilled" ? [batch.value] : [],
  );
  if (succeeded.length === 0) {
    throw new ExternalApiError({
      service: "aviationstack",
      status: 502,
      message: "All AviationStack endpoints failed",
    });
  }

  const deduped = new Map<string, FlightState>();
  for (const item of succeeded.flat()) {
    const flight = toFlightStateFromAviationStack(item);
    if (!flight) continue;
    const existing = deduped.get(flight.icao24);
    const existingTs = existing?.lastContact ?? 0;
    const currentTs = flight.lastContact ?? 0;
    if (!existing || currentTs >= existingTs) {
      deduped.set(flight.icao24, flight);
    }
  }

  return [...deduped.values()];
};

// ---------- OpenSky (fallback) ----------

const toFlightStateFromOpenSky = (
  row: readonly unknown[],
): FlightState | null => {
  const icao24 = (row[0] as string | null)?.trim() ?? "";
  const callsign = (row[1] as string | null)?.trim() ?? "";
  const originCountry = (row[2] as string | null)?.trim() ?? "Unknown";
  const longitude = row[5] as number | null;
  const latitude = row[6] as number | null;
  const altitude = row[7] as number | null;
  const onGround = (row[8] as boolean | null) ?? false;
  const velocity = row[9] as number | null;
  const track = row[10] as number | null;
  const verticalRate = row[11] as number | null;
  const lastContact = row[4] as number | null;

  if (
    !icao24 ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    onGround
  ) {
    return null;
  }

  const flightLatitude = latitude as number;
  const flightLongitude = longitude as number;
  const flightTrack = Number.isFinite(track) ? track : null;
  const direction = classifyFlightDirection(
    flightLatitude,
    flightLongitude,
    flightTrack,
  );

  return {
    id: icao24,
    icao24,
    callsign: callsign || "UNKN",
    originCountry,
    latitude: flightLatitude,
    longitude: flightLongitude,
    altitude: Number.isFinite(altitude) ? altitude : null,
    velocity: Number.isFinite(velocity) ? velocity : null,
    track: flightTrack,
    verticalRate: Number.isFinite(verticalRate) ? verticalRate : null,
    onGround,
    direction,
    lastContact: Number.isFinite(lastContact) ? lastContact : null,
  };
};

const fetchFlightsFromOpenSky = async (): Promise<FlightState[]> => {
  const params = new URLSearchParams({
    lamin: String(SG_BOUNDS.lamin),
    lomin: String(SG_BOUNDS.lomin),
    lamax: String(SG_BOUNDS.lamax),
    lomax: String(SG_BOUNDS.lomax),
  });
  // An ExternalApiError here (including the 404 OpenSky sends for "no
  // aircraft in bounds") is handled by the caller as an empty result.
  const response = await httpGetJson(
    "opensky",
    `${OPENSKY_BASE_URL}/states/all?${params.toString()}`,
    { Accept: "application/json" },
    OpenSkyResponseSchema,
    FLIGHT_TIMEOUT_MS,
  );
  return (response.states ?? [])
    .map((row) => toFlightStateFromOpenSky(row))
    .filter((flight): flight is FlightState => flight !== null);
};

const formatRouteEndpoint = (
  endpoint?: {
    iata: string | null;
    icao: string | null;
    city: string | null;
    name: string | null;
  } | null,
): string | null => {
  if (!endpoint) return null;
  return endpoint.iata || endpoint.icao || endpoint.city || endpoint.name || null;
};

/**
 * Keep only flights inbound to or outbound from Singapore (Changi / Seletar).
 * Uses cached callsign route lookups when available to reject cruising
 * overflights (e.g. SUB -> KUL) and confirm true SIN/XSP arrivals/departures.
 */
const filterToSingaporeInboundOutbound = async (
  flights: FlightState[],
  signal?: AbortSignal,
): Promise<FlightState[]> => {
  const checked = await Promise.all(
    flights.map(async (flight): Promise<FlightState | null> => {
      // Flights already tagged with departure/arrival airports (e.g. AviationStack).
      if (flight.departureAirport || flight.arrivalAirport) {
        return flight.direction === "inbound" || flight.direction === "outbound"
          ? flight
          : null;
      }

      const route =
        flight.callsign && /^[A-Za-z0-9-]{2,12}$/.test(flight.callsign)
          ? await getFlightRoute(flight.callsign, signal).catch(() => null)
          : null;

      if (route && (route.origin || route.destination)) {
        const originIsSg = isSingaporeAirport(
          route.origin?.icao,
          route.origin?.iata,
        );
        const destIsSg = isSingaporeAirport(
          route.destination?.icao,
          route.destination?.iata,
        );
        if (destIsSg && !originIsSg) {
          return {
            ...flight,
            direction: "inbound",
            operator: route.airline ?? flight.operator ?? null,
            originCountry: route.airline ?? flight.originCountry,
            departureAirport: formatRouteEndpoint(route.origin),
            arrivalAirport: formatRouteEndpoint(route.destination),
          };
        }
        if (originIsSg && !destIsSg) {
          return {
            ...flight,
            direction: "outbound",
            operator: route.airline ?? flight.operator ?? null,
            originCountry: route.airline ?? flight.originCountry,
            departureAirport: formatRouteEndpoint(route.origin),
            arrivalAirport: formatRouteEndpoint(route.destination),
          };
        }
        // Confirmed non-Singapore route (overflight) or SG-to-SG hop.
        return null;
      }

      // Unlisted callsign: drop crossing tracks and high-altitude overflights.
      if (flight.direction === "transit") return null;
      if (
        flight.altitude !== null &&
        flight.altitude > MAX_UNVERIFIED_ALTITUDE_M
      ) {
        return null;
      }
      return flight;
    }),
  );

  return checked.filter((flight): flight is FlightState => flight !== null);
};

// ---------- Public client ----------

export const getFlights = (signal?: AbortSignal): Promise<FlightState[]> =>
  cache.get(
    "flights-sg",
    FLIGHTS_CACHE_TTL_MS,
    async () => {
      let flights = await fetchFlightsFromAdsbV2(
        "adsb.lol",
        ADSB_LOL_BASE_URL,
      ).catch(emptyOnExternalApiError);
      if (flights.length === 0) {
        flights = await fetchFlightsFromAdsbV2(
          "airplanes.live",
          AIRPLANES_LIVE_BASE_URL,
        ).catch(emptyOnExternalApiError);
      }
      if (flights.length === 0) {
        flights = await fetchFlightsFromAviationStack().catch(
          emptyOnExternalApiError,
        );
      }
      if (flights.length === 0) {
        flights = await fetchFlightsFromOpenSky().catch(emptyOnExternalApiError);
      }

      const filtered = await filterToSingaporeInboundOutbound(flights, signal);

      const sorted = filtered
        .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
        .slice(0, 120);

      if (sorted.length > 0) {
        cache.set(FLIGHTS_FALLBACK_KEY, sorted);
        return sorted;
      }

      // Read the last-good snapshot without replacing it on failure.
      return (
        cache.peek<FlightState[]>(
          FLIGHTS_FALLBACK_KEY,
          FLIGHTS_FALLBACK_MAX_AGE_MS,
        ) ?? []
      );
    },
    { signal },
  );
