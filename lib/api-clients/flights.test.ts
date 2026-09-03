import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FetchHttpClient } from "@effect/platform";
import { Effect } from "effect";
import { Cache, CacheLive } from "@/lib/cache";
import { SchemaParseError } from "@/lib/errors";
import { getFlights } from "./flights";
import type { FlightState } from "@/types";

type FetchImpl = (input: string | URL | Request) => Promise<Response>;

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

const runGetFlights = (
  fetchImpl: FetchImpl,
  cache: Cache = Effect.runSync(Cache.pipe(Effect.provide(CacheLive))),
) =>
  Effect.runPromiseExit(
    getFlights().pipe(
      Effect.provideService(Cache, cache),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetchImpl as unknown as typeof fetch,
      ),
    ),
  );

const flight = (
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
      airport: "Kuala Lumpur Intl",
      iata: "KUL",
      icao: "WMKK",
    },
  live: {
    updated: options.updated ?? "2026-09-03T00:00:00.000Z",
    latitude: options.latitude ?? 1.3644,
    longitude: options.longitude ?? 103.9915,
    altitude: 10000,
    direction: options.direction !== undefined ? options.direction : 180,
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
  1.3644, // 6  latitude
  options.altitude ?? 3000, // 7  baro_altitude
  false, // 8  on_ground
  options.velocity ?? 250, // 9  velocity
  options.track ?? null, // 10 true_track
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

function flightStates(exit: Awaited<ReturnType<typeof runGetFlights>>) {
  expect(exit._tag).toBe("Success");
  if (exit._tag !== "Success") return [] as FlightState[];
  return exit.value;
}

describe("getFlights fallback chain", () => {
  test("serves AviationStack results without calling OpenSky", async () => {
    let openSkyCalls = 0;
    const exit = await runGetFlights(async (input) => {
      const url = String(input);
      if (url.includes("api.aviationstack.com")) {
        return success({ data: [flight("76C0A1")] });
      }
      openSkyCalls += 1;
      return success({ time: 1, states: null });
    });

    const flights = flightStates(exit);
    expect(flights).toHaveLength(1);
    expect(flights[0].icao24).toBe("76C0A1");
    // AviationStack reports km/h; the client normalizes to m/s.
    expect(flights[0].velocity).toBeCloseTo(800 / 3.6, 1);
    expect(flights[0].lastContact).toBe(
      Math.floor(Date.parse("2026-09-03T00:00:00.000Z") / 1000),
    );
    expect(openSkyCalls).toBe(0);
  });

  test("falls back to OpenSky when AviationStack returns no flights", async () => {
    const exit = await runGetFlights(async (input) => {
      const url = String(input);
      if (url.includes("api.aviationstack.com")) {
        return success({ data: [] });
      }
      return success({ time: 1, states: [openSkyRow("76C0A1")] });
    });

    const flights = flightStates(exit);
    expect(flights).toHaveLength(1);
    expect(flights[0].icao24).toBe("76C0A1");
    expect(flights[0].callsign).toBe("SIA321");
    expect(flights[0].velocity).toBe(250);
    expect(flights[0].onGround).toBe(false);
  });

  test("falls back to OpenSky when every AviationStack endpoint fails", async () => {
    const exit = await runGetFlights(async (input) => {
      if (String(input).includes("api.aviationstack.com")) {
        return fail(503);
      }
      return success({ time: 1, states: [openSkyRow("76C0A1")] });
    });

    const flights = flightStates(exit);
    expect(flights).toHaveLength(1);
    expect(flights[0].icao24).toBe("76C0A1");
  });

  test("treats an empty result from both providers as a valid empty feed", async () => {
    const exit = await runGetFlights(async (input) => {
      if (String(input).includes("api.aviationstack.com")) {
        return success({ data: [] });
      }
      // OpenSky 404 means "no aircraft in bounds", a valid empty result.
      return new Response("not found", { status: 404 });
    });

    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") expect(exit.value).toEqual([]);
  });

  test("serves the last-good snapshot when both providers are empty and never overwrites it", async () => {
    const cache = Effect.runSync(Cache.pipe(Effect.provide(CacheLive)));
    let serveEmpty = false;

    const fetchImpl: FetchImpl = async (input) => {
      const url = String(input);
      if (url.includes("api.aviationstack.com")) {
        return success(serveEmpty ? { data: [] } : { data: [flight("76C0A1")] });
      }
      return success({ time: 1, states: null });
    };

    const program = Effect.gen(function* () {
      const first = yield* getFlights();
      yield* cache.clear("flights-sg");
      serveEmpty = true;
      const second = yield* getFlights();
      yield* cache.clear("flights-sg");
      const third = yield* getFlights();
      return { first, second, third };
    });

    const exit = await Effect.runPromiseExit(
      program.pipe(
        Effect.provideService(Cache, cache),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(
          FetchHttpClient.Fetch,
          fetchImpl as unknown as typeof fetch,
        ),
      ),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value.first).toHaveLength(1);
    // An outage returns the snapshot, not an empty array...
    expect(exit.value.second).toEqual(exit.value.first);
    // ...and the snapshot survives further outages (peek never writes).
    expect(exit.value.third).toEqual(exit.value.first);
  });

  test("propagates a schema failure from the OpenSky fallback", async () => {
    const exit = await runGetFlights(async (input) => {
      if (String(input).includes("api.aviationstack.com")) {
        return fail(503);
      }
      return new Response("not json at all", { status: 200 });
    });

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    expect(exit.cause.error).toBeInstanceOf(SchemaParseError);
  });

  test("sorts by velocity and caps at 120 flights", async () => {
    const flights = Array.from({ length: 150 }, (_, i) =>
      flight(`76C0A${(i + 1).toString().padStart(2, "0")}`, {
        speedKmh: i + 1,
      }),
    );
    const exit = await runGetFlights(async (input) => {
      if (String(input).includes("api.aviationstack.com")) {
        return success({ data: flights });
      }
      throw new Error("OpenSky must not be called");
    });

    const result = flightStates(exit);
    expect(result).toHaveLength(120);
    // Fastest flight first, the slowest of the 150 dropped by the cap.
    expect(result[0].velocity).toBeCloseTo(150 / 3.6, 1);
    expect(result[result.length - 1].velocity).toBeCloseTo(31 / 3.6, 1);
  });

  test("dedupes by icao24 keeping the newest lastContact", async () => {
    const older = flight("76C0A1", { updated: "2026-09-03T00:00:00.000Z" });
    const newer = flight("76C0A1", { updated: "2026-09-03T01:00:00.000Z" });
    const exit = await runGetFlights(async (input) => {
      if (String(input).includes("api.aviationstack.com")) {
        return success({ data: [older, newer] });
      }
      throw new Error("OpenSky must not be called");
    });

    const flights = flightStates(exit);
    expect(flights).toHaveLength(1);
    expect(flights[0].lastContact).toBe(
      Math.floor(Date.parse("2026-09-03T01:00:00.000Z") / 1000),
    );
  });

  test("classifies inbound/outbound/transit directions", async () => {
    const inbound = flight("76C0A1", {
      arrival: { icao: "WSSS", iata: "SIN", airport: "Changi Airport" },
    });

    const outbound = flight("76C0A2", {
      departure: { icao: "WSSS", iata: "SIN", airport: "Changi Airport" },
    });

    const transitSgToSg = flight("76C0A3", {
      departure: { icao: "WSSS", iata: "SIN", airport: "Changi Airport" },
      arrival: { icao: "WSSL", iata: "XSP", airport: "Seletar" },
      direction: null,
    });

    const exit = await runGetFlights(async (input) => {
      if (String(input).includes("api.aviationstack.com")) {
        return success({
          data: [inbound, outbound, transitSgToSg],
        });
      }
      throw new Error("OpenSky must not be called");
    });

    const flights = flightStates(exit);
    const byIcao = new Map(flights.map((f) => [f.icao24, f.direction]));
    expect(byIcao.get("76C0A1")).toBe("inbound");
    expect(byIcao.get("76C0A2")).toBe("outbound");
    expect(byIcao.get("76C0A3")).toBe("transit");
  });

  test("classifies by track toward Changi when no Singapore airport is involved", async () => {
    const headingNorth = flight("76C0A1", { direction: 10 });
    const headingAway = flight("76C0A2", { direction: 190 });
    const crossing = flight("76C0A3", { direction: 90 });
    const noTrack = flight("76C0A4", { direction: null });

    const exit = await runGetFlights(async (input) => {
      if (String(input).includes("api.aviationstack.com")) {
        return success({ data: [headingNorth, headingAway, crossing, noTrack] });
      }
      throw new Error("OpenSky must not be called");
    });

    const flights = flightStates(exit);
    const byIcao = new Map(flights.map((f) => [f.icao24, f.direction]));
    expect(byIcao.get("76C0A1")).toBe("inbound");
    expect(byIcao.get("76C0A2")).toBe("outbound");
    expect(byIcao.get("76C0A3")).toBe("transit");
    expect(byIcao.get("76C0A4")).toBe("transit");
  });
});
