import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cache } from "@/lib/cache";
import { SchemaParseError } from "@/lib/errors";
import { getFlights } from "@/lib/api-clients/flights";
import {
  rejection,
  withFetch,
  type FetchStub,
} from "../helpers/upstream";

const API_KEY = "test-key-123";
const originalKey = process.env.AVIATIONSTACK_API_KEY;

beforeEach(() => {
  process.env.AVIATIONSTACK_API_KEY = API_KEY;
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.AVIATIONSTACK_API_KEY;
  } else {
    process.env.AVIATIONSTACK_API_KEY = originalKey;
  }
});

const runGetFlights = (fetchImpl: FetchStub) =>
  withFetch(fetchImpl, getFlights);

const isRouteLookup = (url: string) =>
  url.includes("api.adsbdb.com") || url.includes("hexdb.io");

const airplanesLiveAc = (
  hex: string,
  options: Partial<{
    flight: string | null;
    r: string | null;
    t: string | null;
    desc: string | null;
    ownOp: string | null;
    lat: number;
    lon: number;
    alt_baro: number | "ground" | null;
    alt_geom: number | null;
    gs: number | null;
    track: number | null;
    baro_rate: number | null;
    seen: number | null;
  }> = {},
): Record<string, unknown> => ({
  hex,
  flight: options.flight !== undefined ? options.flight : "SIA321  ",
  r: options.r !== undefined ? options.r : "9V-SMU",
  t: options.t !== undefined ? options.t : "A359",
  desc: options.desc !== undefined ? options.desc : "AIRBUS A350-900",
  ownOp: options.ownOp !== undefined ? options.ownOp : "Singapore Airlines",
  // South of Changi heading north (inbound) by default.
  lat: options.lat ?? 1.2,
  lon: options.lon ?? 103.9915,
  alt_baro: options.alt_baro !== undefined ? options.alt_baro : 10_000,
  alt_geom: options.alt_geom !== undefined ? options.alt_geom : 10_200,
  gs: options.gs !== undefined ? options.gs : 450,
  track: options.track !== undefined ? options.track : 0,
  baro_rate: options.baro_rate !== undefined ? options.baro_rate : -600,
  seen: options.seen !== undefined ? options.seen : 2.5,
});

const aviationStackFlight = (
  icao24: string,
  options: Partial<{
    updated: string;
    direction: number | null;
    speedKmh: number | null;
    latitude: number;
    longitude: number;
    departure: { icao: string | null; iata: string | null; airport: string | null };
    arrival: { icao: string | null; iata: string | null; airport: string | null };
  }> = {},
): Record<string, unknown> => ({
  flight: { icao: "SIA5SQ", iata: "SQ5", number: "5" },
  airline: { iata: "SQ", name: "Singapore Airlines" },
  aircraft: { icao24, registration: "9V-SMP" },
  departure:
    options.departure ?? {
      airport: "Suvarnabhumi",
      iata: "BKK",
      icao: "VTBS",
    },
  arrival:
    options.arrival ?? {
      airport: "Singapore Changi",
      iata: "SIN",
      icao: "WSSS",
    },
  live: {
    updated: options.updated ?? "2026-09-03T00:00:00.000Z",
    latitude: options.latitude ?? 1.2,
    longitude: options.longitude ?? 103.9915,
    altitude: 3000,
    direction: options.direction !== undefined ? options.direction : 0,
    speed_horizontal: options.speedKmh ?? 800,
    speed_vertical: 0,
    is_ground: false,
  },
});

const openSkyRow = (
  icao24: string,
  options: Partial<{
    lastContact: number;
    velocity: number | null;
    track: number | null;
    altitude: number | null;
  }> = {},
): unknown[] => [
  icao24, // 0  icao24
  "SIA321 ", // 1  callsign
  "Singapore", // 2  origin_country
  0, // 3  time_position
  options.lastContact ?? 60, // 4  last_contact
  103.9915, // 5  longitude
  1.2, // 6  latitude (south of Changi)
  options.altitude ?? 3000, // 7  baro_altitude
  false, // 8  on_ground
  options.velocity ?? 250, // 9  velocity
  options.track !== undefined ? options.track : 0, // 10 true_track (north -> inbound)
  0, // 11 vertical_rate
  null, // 12
  null, // 13
  null, // 14
  null, // 15
  null, // 16
  null, // 17
];

const success = async (value: unknown) => Response.json(value);
const fail = async (status: number) => new Response("unavailable", { status });

describe("getFlights ADS-B v2 primary & fallback chain", () => {
  test("serves adsb.lol results without calling airplanes.live, AviationStack, or OpenSky", async () => {
    let fallbackCalls = 0;
    const nowMs = 1_760_000_000_000;
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol")) {
        expect(url).toContain("/v2/point/1.3644/103.9915/35");
        return success({
          now: nowMs,
          ac: [
            airplanesLiveAc("76ce81", {
              flight: "SIA321  ",
              alt_baro: 10_000,
              gs: 400,
              baro_rate: -1000,
              seen: 4,
            }),
            // Ground aircraft must be filtered out.
            airplanesLiveAc("76ce82", { alt_baro: "ground" }),
          ],
        });
      }
      fallbackCalls += 1;
      return fail(500);
    });

    expect(result).toHaveLength(1);
    expect(result[0].icao24).toBe("76CE81");
    expect(result[0].callsign).toBe("SIA321");
    expect(result[0].originCountry).toBe("Singapore Airlines");
    expect(result[0].altitude).toBeCloseTo(10_000 * 0.3048, 2);
    expect(result[0].velocity).toBeCloseTo(400 * 0.514444, 2);
    expect(result[0].verticalRate).toBeCloseTo(-1000 * 0.00508, 2);
    expect(result[0].lastContact).toBe(Math.floor(nowMs / 1000 - 4));
    expect(fallbackCalls).toBe(0);
  });

  test("falls back to airplanes.live when adsb.lol fails", async () => {
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol")) {
        return fail(503);
      }
      if (url.includes("api.airplanes.live")) {
        return success({
          now: 1_760_000_000_000,
          ac: [airplanesLiveAc("76ce85")],
        });
      }
      throw new Error("AviationStack/OpenSky must not be called");
    });

    expect(result).toHaveLength(1);
    expect(result[0].icao24).toBe("76CE85");
  });

  test("falls back to type + registration when ADS-B omits ownOp", async () => {
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol")) {
        return success({
          now: 1_760_000_000_000,
          ac: [
            airplanesLiveAc("~76ce89", {
              flight: null,
              ownOp: null,
              t: "B78X",
              r: "9V-SCA",
              alt_baro: null,
              alt_geom: 5000,
            }),
          ],
        });
      }
      throw new Error("Fallback must not be called");
    });

    expect(result).toHaveLength(1);
    expect(result[0].icao24).toBe("76CE89");
    expect(result[0].callsign).toBe("9V-SCA");
    expect(result[0].originCountry).toBe("B78X · 9V-SCA");
    expect(result[0].altitude).toBeCloseTo(5000 * 0.3048, 2);
  });

  test("falls back to AviationStack when adsb.lol and airplanes.live fail", async () => {
    let openSkyCalls = 0;
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol") || url.includes("api.airplanes.live")) {
        return fail(403);
      }
      if (url.includes("api.aviationstack.com")) {
        return success({ data: [aviationStackFlight("76C0A1")] });
      }
      openSkyCalls += 1;
      return success({ time: 1, states: null });
    });

    expect(result).toHaveLength(1);
    expect(result[0].icao24).toBe("76C0A1");
    expect(result[0].velocity).toBeCloseTo(800 / 3.6, 1);
    expect(openSkyCalls).toBe(0);
  });

  test("falls back to OpenSky when ADS-B and AviationStack return no flights", async () => {
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol") || url.includes("api.airplanes.live")) {
        return success({ now: 1_760_000_000_000, ac: [] });
      }
      if (url.includes("api.aviationstack.com")) {
        return success({ data: [] });
      }
      return success({ time: 1, states: [openSkyRow("76C0A1")] });
    });

    expect(result).toHaveLength(1);
    expect(result[0].icao24).toBe("76C0A1");
    expect(result[0].callsign).toBe("SIA321");
    expect(result[0].velocity).toBe(250);
    expect(result[0].onGround).toBe(false);
  });

  test("falls back to OpenSky when ADS-B and AviationStack all fail", async () => {
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (
        url.includes("api.adsb.lol") ||
        url.includes("api.airplanes.live") ||
        url.includes("api.aviationstack.com")
      ) {
        return fail(503);
      }
      return success({ time: 1, states: [openSkyRow("76C0A1")] });
    });

    expect(result).toHaveLength(1);
    expect(result[0].icao24).toBe("76C0A1");
  });

  test("treats an empty result from all providers as a valid empty feed", async () => {
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol") || url.includes("api.airplanes.live")) {
        return success({ now: 1_760_000_000_000, ac: [] });
      }
      if (url.includes("api.aviationstack.com")) {
        return success({ data: [] });
      }
      return new Response("not found", { status: 404 });
    });

    expect(result).toEqual([]);
  });

  test("serves the last-good snapshot when all providers are empty and never overwrites it", async () => {
    let serveEmpty = false;

    const fetchImpl: FetchStub = async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol")) {
        return success({
          now: 1_760_000_000_000,
          ac: serveEmpty ? [] : [airplanesLiveAc("76c0a1")],
        });
      }
      if (url.includes("api.airplanes.live")) {
        return success({ now: 1_760_000_000_000, ac: [] });
      }
      if (url.includes("api.aviationstack.com")) {
        return success({ data: [] });
      }
      return success({ time: 1, states: null });
    };

    const { first, second, third } = await withFetch(fetchImpl, async () => {
      const first = await getFlights();
      cache.clear("flights-sg");
      serveEmpty = true;
      const second = await getFlights();
      cache.clear("flights-sg");
      const third = await getFlights();
      return { first, second, third };
    });

    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  test("propagates a schema failure from adsb.lol", async () => {
    const error = await rejection(
      runGetFlights(async () => new Response("not json at all", { status: 200 })),
    );

    expect(error).toBeInstanceOf(SchemaParseError);
  });

  test("sorts by velocity and caps at 120 flights", async () => {
    const aircraft = Array.from({ length: 150 }, (_, i) =>
      airplanesLiveAc(`76c0${(i + 1).toString(16).padStart(2, "0")}`, {
        flight: `SIA${100 + i}`,
        gs: i + 1,
      }),
    );
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol")) {
        return success({ now: 1_760_000_000_000, ac: aircraft });
      }
      throw new Error("Fallbacks must not be called");
    });

    expect(result).toHaveLength(120);
    expect(result[0].velocity).toBeCloseTo(150 * 0.514444, 1);
    expect(result[result.length - 1].velocity).toBeCloseTo(31 * 0.514444, 1);
  });

  test("dedupes ADS-B aircraft by icao24 keeping the freshest seen", async () => {
    const nowMs = 1_760_000_000_000;
    const stale = airplanesLiveAc("76c0a1", { seen: 30, gs: 200 });
    const fresh = airplanesLiveAc("76c0a1", { seen: 1, gs: 350 });
    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol")) {
        return success({ now: nowMs, ac: [stale, fresh] });
      }
      throw new Error("Fallbacks must not be called");
    });

    expect(result).toHaveLength(1);
    expect(result[0].lastContact).toBe(Math.floor(nowMs / 1000 - 1));
    expect(result[0].velocity).toBeCloseTo(350 * 0.514444, 1);
  });

  test("keeps only inbound and outbound flights and drops transit/high-altitude overflights", async () => {
    // South of Changi: heading north (~0°) is inbound, south (~180°) is outbound,
    // east (~90°) is transit, and high-altitude unlisted (>24,000 ft) is overflight.
    const headingNorth = airplanesLiveAc("76c0a1", { flight: "UNL1", lat: 1.2, lon: 103.9915, track: 10, alt_baro: 8000 });
    const headingAway = airplanesLiveAc("76c0a2", { flight: "UNL2", lat: 1.2, lon: 103.9915, track: 190, alt_baro: 12000 });
    const crossing = airplanesLiveAc("76c0a3", { flight: "UNL3", lat: 1.2, lon: 103.9915, track: 90, alt_baro: 8000 });
    const highOverflight = airplanesLiveAc("76c0a4", { flight: "UNL4", lat: 1.2, lon: 103.9915, track: 10, alt_baro: 36000 });

    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (isRouteLookup(url)) return fail(404);
      if (url.includes("api.adsb.lol")) {
        return success({
          now: 1_760_000_000_000,
          ac: [headingNorth, headingAway, crossing, highOverflight],
        });
      }
      throw new Error("Fallbacks must not be called");
    });

    const byIcao = new Map(result.map((f) => [f.icao24, f.direction]));
    expect(byIcao.get("76C0A1")).toBe("inbound");
    expect(byIcao.get("76C0A2")).toBe("outbound");
    expect(byIcao.has("76C0A3")).toBe(false);
    expect(byIcao.has("76C0A4")).toBe(false);
  });

  test("uses route lookups to confirm SIN arrivals/departures and reject non-SG overflights", async () => {
    const inboundConfirmed = airplanesLiveAc("76c101", { flight: "SIA321", track: 90, alt_baro: 28000 });
    const outboundConfirmed = airplanesLiveAc("76c102", { flight: "SIA638", track: 90, alt_baro: 26000 });
    const overflightConfirmed = airplanesLiveAc("76c103", { flight: "MAS870", track: 0, alt_baro: 10000 });

    const result = await runGetFlights(async (input) => {
      const url = String(input);
      if (url.includes("api.adsb.lol")) {
        return success({
          now: 1_760_000_000_000,
          ac: [inboundConfirmed, outboundConfirmed, overflightConfirmed],
        });
      }
      if (url.includes("api.adsbdb.com/v0/callsign/SIA321")) {
        return success({
          response: {
            flightroute: {
              airline: { name: "Singapore Airlines" },
              origin: { iata_code: "LHR", icao_code: "EGLL" },
              destination: { iata_code: "SIN", icao_code: "WSSS" },
            },
          },
        });
      }
      if (url.includes("api.adsbdb.com/v0/callsign/SIA638")) {
        return success({
          response: {
            flightroute: {
              airline: { name: "Singapore Airlines" },
              origin: { iata_code: "SIN", icao_code: "WSSS" },
              destination: { iata_code: "NRT", icao_code: "RJAA" },
            },
          },
        });
      }
      if (url.includes("api.adsbdb.com/v0/callsign/MAS870")) {
        return success({
          response: {
            flightroute: {
              airline: { name: "Malaysia Airlines" },
              origin: { iata_code: "SUB", icao_code: "WARR" },
              destination: { iata_code: "KUL", icao_code: "WMKK" },
            },
          },
        });
      }
      return fail(404);
    });

    expect(result).toHaveLength(2);
    const byIcao = new Map(result.map((f) => [f.icao24, f]));
    expect(byIcao.get("76C101")?.direction).toBe("inbound");
    expect(byIcao.get("76C101")?.departureAirport).toBe("LHR");
    expect(byIcao.get("76C101")?.arrivalAirport).toBe("SIN");
    expect(byIcao.get("76C102")?.direction).toBe("outbound");
    expect(byIcao.get("76C102")?.departureAirport).toBe("SIN");
    expect(byIcao.get("76C102")?.arrivalAirport).toBe("NRT");
    expect(byIcao.has("76C103")).toBe(false);
  });
});
