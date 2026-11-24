/**
 * On-demand callsign -> origin/destination route lookup using adsbdb.com
 * (primary) and hexdb.io (fallback). Both are free and keyless; results are
 * cached for 6 hours per callsign since airline schedules rarely change mid-day.
 */
import { cache } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import {
  AdsbdbCallsignResponseSchema,
  HexdbRouteResponseSchema,
} from "@/types/schemas";
import type { FlightRouteEndpoint, FlightRouteInfo } from "@/types";
import { httpGetJson } from "./http";

const ADSBDB_BASE_URL = "https://api.adsbdb.com/v0";
const HEXDB_BASE_URL = "https://hexdb.io/api/v1";
const ROUTE_TIMEOUT_MS = 4_500;
const ROUTE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const cleanString = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
};

const toEndpoint = (raw?: {
  iata_code?: string | null;
  icao_code?: string | null;
  name?: string | null;
  municipality?: string | null;
  country_name?: string | null;
} | null): FlightRouteEndpoint | null => {
  if (!raw) return null;
  const endpoint: FlightRouteEndpoint = {
    iata: cleanString(raw.iata_code),
    icao: cleanString(raw.icao_code),
    name: cleanString(raw.name),
    city: cleanString(raw.municipality),
    country: cleanString(raw.country_name),
  };
  return endpoint.iata || endpoint.icao || endpoint.name ? endpoint : null;
};

const fetchFromAdsbdb = async (
  callsign: string,
): Promise<FlightRouteInfo | null> => {
  try {
    const payload = await httpGetJson(
      "adsbdb",
      `${ADSBDB_BASE_URL}/callsign/${encodeURIComponent(callsign)}`,
      { Accept: "application/json" },
      AdsbdbCallsignResponseSchema,
      ROUTE_TIMEOUT_MS,
    );
    if (typeof payload.response === "string") return null;
    const route = payload.response.flightroute;
    if (!route) return null;
    const origin = toEndpoint(route.origin);
    const destination = toEndpoint(route.destination);
    if (!origin && !destination) return null;
    return {
      callsign,
      iataFlight: cleanString(route.callsign_iata),
      airline: cleanString(route.airline?.name),
      origin,
      destination,
    };
  } catch (error) {
    if (error instanceof ExternalApiError) return null;
    throw error;
  }
};

const fetchFromHexdb = async (
  callsign: string,
): Promise<FlightRouteInfo | null> => {
  try {
    const payload = await httpGetJson(
      "hexdb",
      `${HEXDB_BASE_URL}/route/iata/${encodeURIComponent(callsign)}`,
      { Accept: "application/json" },
      HexdbRouteResponseSchema,
      ROUTE_TIMEOUT_MS,
    );
    const rawRoute = cleanString(payload.route);
    if (!rawRoute) return null;
    const parts = rawRoute
      .split("-")
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
    if (parts.length < 2) return null;
    return {
      callsign,
      iataFlight: null,
      airline: null,
      origin: { iata: parts[0], icao: null, name: null, city: null, country: null },
      destination: {
        iata: parts[parts.length - 1],
        icao: null,
        name: null,
        city: null,
        country: null,
      },
    };
  } catch (error) {
    if (error instanceof ExternalApiError) return null;
    throw error;
  }
};

export const getFlightRoute = (
  rawCallsign: string,
  signal?: AbortSignal,
): Promise<FlightRouteInfo | null> => {
  const callsign = rawCallsign.trim().toUpperCase();
  if (!callsign) return Promise.resolve(null);
  return cache.get(
    `flight-route:${callsign}`,
    ROUTE_CACHE_TTL_MS,
    async () => {
      const fromAdsbdb = await fetchFromAdsbdb(callsign);
      if (fromAdsbdb) return fromAdsbdb;
      return fetchFromHexdb(callsign);
    },
    { signal },
  );
};
