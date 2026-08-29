/**
 * Flight clients: AviationStack (primary) with OpenSky fallback and a
 * last-good snapshot.
 *
 * Failure semantics: a single AviationStack endpoint failing is tolerated
 * (partial results), but the provider as a whole fails when every endpoint
 * fails — so `getFlights` can distinguish "provider down" (fall back to
 * OpenSky) from "no aircraft airborne". The last-good snapshot is read with
 * `Cache.peek`, which never writes, so an outage can no longer overwrite
 * the snapshot with an empty array.
 */
import { HttpClient } from "@effect/platform";
import { Effect } from "effect";
import { Cache } from "@/lib/cache";
import { ExternalApiError, type UpstreamError } from "@/lib/errors";
import {
  AviationStackResponseSchema,
  OpenSkyResponseSchema,
} from "@/types/schemas";
import type { AviationStackFlight } from "@/types/schemas";
import type { FlightDirection, FlightState } from "@/types";
import { httpGetJson } from "./http";

const AVIATIONSTACK_BASE_URL = "https://api.aviationstack.com/v1";
const OPENSKY_BASE_URL = "https://opensky-network.org/api";
const FLIGHT_TIMEOUT_MS = 6_000;
const FLIGHTS_CACHE_TTL_MS = 15_000;
const FLIGHTS_FALLBACK_KEY = "flights-sg-fallback";
const FLIGHTS_FALLBACK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
const SG_BOUNDS = {
  lamin: 1.15,
  lomin: 103.45,
  lamax: 1.5,
  lomax: 104.15,
};
const CHANGI_COORDS = { lat: 1.3644, lon: 103.9915 };
const SG_AIRPORT_ICAO = new Set(["WSSS", "WSSL"]);
const SG_AIRPORT_IATA = new Set(["SIN", "XSP"]);

const getAviationStackApiKey = (): Effect.Effect<string, ExternalApiError> =>
  Effect.gen(function* () {
    const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
    if (
      !apiKey ||
      apiKey.toLowerCase().includes("your_aviationstack_key")
    ) {
      return yield* Effect.fail(
        new ExternalApiError({
          service: "aviationstack",
          message: "Missing AVIATIONSTACK_API_KEY",
          status: 401,
        }),
      );
    }
    return apiKey;
  });

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

// ---------- AviationStack (primary) ----------

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
    // Aircraft identity must survive provider refreshes; timestamps belong
    // in `lastContact`, never in React/Map feature identity.
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
  };
};

const fetchFlightsFromAviationStack = (): Effect.Effect<
  FlightState[],
  UpstreamError,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const apiKey = yield* getAviationStackApiKey();
    const endpoints = [
      { dep_icao: "WSSS" },
      { arr_icao: "WSSS" },
      { dep_icao: "WSSL" },
      { arr_icao: "WSSL" },
    ] as const;

    // Individual endpoint failures are tolerated (partial results); the
    // provider as a whole fails only when every endpoint fails.
    const batches = yield* Effect.all(
      endpoints.map((filter) =>
        Effect.gen(function* () {
          const params = new URLSearchParams({
            access_key: apiKey,
            limit: "100",
            ...filter,
          });
          const response = yield* httpGetJson(
            "aviationstack",
            `${AVIATIONSTACK_BASE_URL}/flights?${params.toString()}`,
            { Accept: "application/json" },
            AviationStackResponseSchema,
            FLIGHT_TIMEOUT_MS,
          );
          if (response.error) {
            return yield* Effect.fail(
              new ExternalApiError({
                service: "aviationstack",
                message: `Aviationstack error${
                  response.error.code ? ` ${response.error.code}` : ""
                }: ${
                  response.error.info ??
                  response.error.type ??
                  "unknown"
                }`,
                status: 502,
              }),
            );
          }
          return response.data ?? [];
        }).pipe(Effect.either),
      ),
      { concurrency: "unbounded" },
    );

    const succeeded = batches.flatMap((batch) =>
      batch._tag === "Right" ? [batch.right] : [],
    );
    if (succeeded.length === 0) {
      return yield* Effect.fail(
        new ExternalApiError({
          service: "aviationstack",
          status: 502,
          message: "All AviationStack endpoints failed",
        }),
      );
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
  });

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

const fetchFlightsFromOpenSky = (): Effect.Effect<
  FlightState[],
  UpstreamError,
  HttpClient.HttpClient
> => {
  const params = new URLSearchParams({
    lamin: String(SG_BOUNDS.lamin),
    lomin: String(SG_BOUNDS.lomin),
    lamax: String(SG_BOUNDS.lamax),
    lomax: String(SG_BOUNDS.lomax),
  });
  return Effect.gen(function* () {
    // A 404 from the states endpoint means "no aircraft in bounds" — a
    // valid empty result rather than a provider failure.
    const response = yield* httpGetJson(
      "opensky",
      `${OPENSKY_BASE_URL}/states/all?${params.toString()}`,
      { Accept: "application/json" },
      OpenSkyResponseSchema,
      FLIGHT_TIMEOUT_MS,
    ).pipe(
      Effect.catchTag("ExternalApiError", (e) =>
        e.status === 404
          ? Effect.succeed({ time: 0, states: null })
          : Effect.fail(e),
      ),
    );

    const states = response.states ?? [];
    return states
      .map((row) => toFlightStateFromOpenSky(row))
      .filter((flight): flight is FlightState => flight !== null);
  });
};

// ---------- Public client ----------

export const getFlights = (): Effect.Effect<
  FlightState[],
  UpstreamError,
  Cache | HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "flights-sg",
      FLIGHTS_CACHE_TTL_MS,
      Effect.gen(function* () {
        // Only swallow ExternalApiError (the provider is unavailable or
        // returned an empty-but-valid result). Timeout and schema failures
        // propagate so the route can report 504/502.
        const primary = yield* fetchFlightsFromAviationStack().pipe(
          Effect.catchTag("ExternalApiError", () =>
            Effect.succeed<FlightState[]>([]),
          ),
        );
        let flights = primary;

        if (flights.length === 0) {
          flights = yield* fetchFlightsFromOpenSky().pipe(
            Effect.catchTag("ExternalApiError", () =>
              Effect.succeed<FlightState[]>([]),
            ),
          );
        }

        const sorted = flights
          .sort((a, b) => (b.velocity ?? 0) - (a.velocity ?? 0))
          .slice(0, 120);

        if (sorted.length > 0) {
          yield* cache.set(FLIGHTS_FALLBACK_KEY, sorted);
          return sorted;
        }

        // Last-good snapshot. `peek` only reads: caching an empty producer
        // here used to overwrite the snapshot after a 10-minute outage.
        const snapshot = yield* cache.peek<FlightState[]>(
          FLIGHTS_FALLBACK_KEY,
          FLIGHTS_FALLBACK_MAX_AGE_MS,
        );
        return snapshot ?? [];
      }),
    );
  });
