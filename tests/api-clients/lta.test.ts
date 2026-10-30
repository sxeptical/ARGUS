import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FetchHttpClient } from "@effect/platform";
import { Effect } from "effect";
import { Schema } from "effect";
import { CacheLive } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import { LtaTrafficIncidentsResponseSchema } from "@/types/schemas";
import {
  collectLtaPages,
  getCarparkAvailability,
  getEvChargingLocations,
  getTrafficCameras,
  getTrafficIncidents,
  normalizeCarparkAvailability,
  normalizeEvChargingLocations,
  normalizeTrafficIncidents,
  normalizeTrainServiceAlerts,
} from "@/lib/api-clients/lta";

const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ id: i }));

const originalKey = process.env.LTA_API_KEY;

beforeEach(() => {
  process.env.LTA_API_KEY = "test-lta-key";
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.LTA_API_KEY;
  } else {
    process.env.LTA_API_KEY = originalKey;
  }
});

describe("collectLtaPages", () => {
  test("walks pages until a short page ends the collection", async () => {
    const skips: number[] = [];
    const pages = await Effect.runPromise(
      collectLtaPages(
        (skip) =>
          Effect.sync(() => {
            skips.push(skip);
            return { value: skip === 0 ? rows(500) : rows(3) };
          }),
        { pageSize: 500, maxPages: 10, service: "lta" },
      ),
    );

    expect(pages).toHaveLength(503);
    expect(skips).toEqual([0, 500]);
  });

  test("an empty or null page stops the walk", async () => {
    const empty = await Effect.runPromise(
      collectLtaPages(
        () => Effect.succeed({ value: [] }),
        { pageSize: 500, maxPages: 10, service: "lta" },
      ),
    );
    expect(empty).toEqual([]);

    const nullPage = await Effect.runPromise(
      collectLtaPages(
        () => Effect.succeed(null),
        { pageSize: 500, maxPages: 10, service: "lta" },
      ),
    );
    expect(nullPage).toEqual([]);
  });

  test("fails when the safety cap is reached without an end marker", async () => {
    const exit = await Effect.runPromiseExit(
      collectLtaPages(
        () => Effect.succeed({ value: rows(500) }),
        { pageSize: 500, maxPages: 3, service: "lta" },
      ),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    expect(exit.cause.error).toBeInstanceOf(ExternalApiError);
    expect(exit.cause.error.status).toBe(502);
    expect(exit.cause.error.message).toContain("safety cap");
  });

  test("fetches pages in concurrent batches at the requested skip offsets", async () => {
    const skips: number[] = [];
    const pages = await Effect.runPromise(
      collectLtaPages(
        (skip) =>
          Effect.sync(() => {
            skips.push(skip);
            return { value: skip < 2000 ? rows(500) : rows(1) };
          }),
        { pageSize: 500, maxPages: 5, service: "lta", concurrency: 3 },
      ),
    );

    expect(skips).toEqual([0, 500, 1000, 1500, 2000]);
    expect(pages).toHaveLength(4 * 500 + 1);
  });
});

const runCameras = (
  fetchImpl: (input: string | URL | Request) => Promise<Response>,
) =>
  Effect.runPromiseExit(
    getTrafficCameras().pipe(
      Effect.provide(CacheLive),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetchImpl as unknown as typeof fetch,
      ),
    ),
  );

describe("getTrafficCameras", () => {
  test("keeps only cameras whose image URL is on the allowlisted host", async () => {
    const exit = await runCameras(async () =>
      Response.json({
        value: [
          {
            CameraID: "A001",
            Latitude: 1.3,
            Longitude: 103.8,
            ImageLink:
              "https://dm-traffic-camera-itsc.s3.ap-southeast-1.amazonaws.com/cam1.jpg",
          },
          {
            CameraID: "B002",
            Latitude: 1.31,
            Longitude: 103.81,
            ImageLink: "https://evil.example/cam2.jpg",
          },
        ],
      }),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value).toHaveLength(1);
    expect(exit.value[0].location).toBe("Camera A001");
    expect(exit.value[0].CameraID).toBe("A001");
  });

  test("flattens the wrapped { Cameras: [...] } response shape", async () => {
    const exit = await runCameras(async () =>
      Response.json({
        value: [
          {
            Cameras: [
              {
                CameraID: "C001",
                Latitude: 1.3,
                Longitude: 103.8,
                ImageLink: "https://images.data.gov.sg/c1.jpg",
              },
            ],
          },
          {
            Cameras: [
              {
                CameraID: "C002",
                Latitude: 1.31,
                Longitude: 103.81,
                ImageLink: "https://datamall2.mytransport.sg/c2.jpg",
              },
            ],
          },
        ],
      }),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value).toHaveLength(2);
  });

  test("treats a 404 as an empty feed rather than a failure", async () => {
    const exit = await runCameras(async () =>
      new Response("not found", { status: 404 }),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") expect(exit.value).toEqual([]);
  });
});

describe("getTrafficIncidents", () => {
  test("decodes, normalizes, hashes, and filters incident rows", async () => {
    const payload = {
        value: [
        { Type: "Accident", Latitude: 1.3, Longitude: 103.8, Message: "Crash on CTE" },
      ],
    };
    expect(Schema.decodeUnknownSync(LtaTrafficIncidentsResponseSchema)(payload).value).toHaveLength(1);
    expect(normalizeTrafficIncidents([...payload.value, { Type: "Obstacle", Latitude: Number.NaN, Longitude: 103.81, Message: "Bad row" }])).toHaveLength(1);
    const exit = await Effect.runPromiseExit(
      getTrafficIncidents().pipe(
        Effect.provide(CacheLive),
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, (async () => Response.json(payload)) as unknown as typeof fetch),
      ),
    );
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value).toHaveLength(1);
    expect(exit.value[0]).toMatchObject({ type: "Accident", lat: 1.3, lng: 103.8, message: "Crash on CTE" });
    expect(exit.value[0].id).toMatch(/^[a-f0-9]{16}$/);
  });
});

const runWithFetch = <A, E>(
  effect: Effect.Effect<A, E, import("@/lib/cache").Cache | import("@effect/platform").HttpClient.HttpClient>,
  fetchImpl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) =>
  Effect.runPromiseExit(
    effect.pipe(
      Effect.provide(CacheLive),
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetchImpl as unknown as typeof fetch),
    ),
  );

const carparkRow = (overrides: Record<string, unknown> = {}) => ({
  CarParkID: "TPMN",
  Area: "",
  Development: "BLK 78B TOA PAYOH CENTRAL",
  Location: "1.33489 103.84857",
  AvailableLots: 421,
  LotType: "C",
  Agency: "HDB",
  ...overrides,
});

describe("normalizeCarparkAvailability", () => {
  test("merges lot types per carpark and drops unparseable locations", () => {
    const carparks = normalizeCarparkAvailability([
      carparkRow(),
      carparkRow({ LotType: "Y", AvailableLots: 12 }),
      carparkRow({ CarParkID: "1", Agency: "LTA", Development: "Suntec City", LotType: "H", AvailableLots: 3 }),
      carparkRow({ CarParkID: "X", Location: "" }),
    ]);
    expect(carparks).toEqual([
      { id: "HDB:TPMN", name: "BLK 78B TOA PAYOH CENTRAL", area: "", agency: "HDB", lat: 1.33489, lng: 103.84857, carLots: 421, motorcycleLots: 12, heavyLots: null },
      { id: "LTA:1", name: "Suntec City", area: "", agency: "LTA", lat: 1.33489, lng: 103.84857, carLots: null, motorcycleLots: null, heavyLots: 3 },
    ]);
  });
});

describe("getCarparkAvailability", () => {
  test("walks every DataMall page before normalizing", async () => {
    const urls: string[] = [];
    const exit = await runWithFetch(getCarparkAvailability(), async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      urls.push(url);
      const skip = Number(new URL(url).searchParams.get("$skip"));
      const count = skip === 0 ? 500 : 2;
      return Response.json({
        value: Array.from({ length: count }, (_, i) => carparkRow({ CarParkID: `${skip + i}` })),
      });
    });
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value).toHaveLength(502);
    expect(urls.every((url) => url.includes("/CarParkAvailabilityv2"))).toBe(true);
  });
});

const evLocation = {
  name: "CLARKE QUAY",
  address: "3E RIVER VALLEY ROAD SINGAPORE 179024",
  latitude: 1.290314,
  longtitude: 103.846728,
  postalCode: "179024",
  chargingPoints: [
    {
      operator: "SP MOBILITY PTE. LTD.",
      plugTypes: [
        { plugType: "Combo 2", current: "DC", powerRating: "50", evIds: [{ status: "1" }, { status: "0" }] },
        { plugType: "Type 2", current: "AC", powerRating: "22", evIds: [{ status: "" }] },
      ],
    },
  ],
};

describe("normalizeEvChargingLocations", () => {
  test("sums connector statuses and keeps the peak power", () => {
    const [location] = normalizeEvChargingLocations([evLocation]);
    expect(location).toMatchObject({
      name: "CLARKE QUAY",
      lat: 1.290314,
      lng: 103.846728,
      available: 1,
      occupied: 1,
      total: 3,
      maxPowerKw: 50,
      hasDc: true,
      operators: ["SP MOBILITY PTE. LTD."],
      plugTypes: ["Combo 2", "Type 2"],
    });
    expect(location.id).toMatch(/^[a-f0-9]{16}$/);
  });

  test("accepts `longitude` and drops rows without coordinates", () => {
    const { longtitude, ...rest } = evLocation;
    expect(normalizeEvChargingLocations([{ ...rest, longitude: longtitude }])).toHaveLength(1);
    expect(normalizeEvChargingLocations([{ ...evLocation, latitude: null }])).toHaveLength(0);
  });
});

describe("getEvChargingLocations", () => {
  const batchLink = "https://dmprod-datasets.s3.ap-southeast-1.amazonaws.com/ev-batch/EVBatch.json?X-Amz-Signature=abc";

  test("follows the trusted batch link without forwarding the AccountKey", async () => {
    const requests: Array<{ url: string; accountKey: string | null }> = [];
    const exit = await runWithFetch(getEvChargingLocations(), async (input, init) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      requests.push({ url: request.url, accountKey: request.headers.get("AccountKey") });
      return request.url.includes("/EVCBatch")
        ? Response.json({ value: [{ Link: batchLink }] })
        : new Response(JSON.stringify({ LastUpdatedTime: "2026-10-21 16:30:00", evLocationsData: [evLocation] }), { headers: { "content-type": "text/plain" } });
    });
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(requests[0].accountKey).toBe("test-lta-key");
    expect(requests[1]).toEqual({ url: batchLink, accountKey: null });
  });

  test("refuses a batch link outside the LTA dataset bucket", async () => {
    let calls = 0;
    const exit = await runWithFetch(getEvChargingLocations(), async () => {
      calls += 1;
      return Response.json({ value: [{ Link: "https://evil.example/EVBatch.json" }] });
    });
    expect(exit._tag).toBe("Failure");
    expect(calls).toBe(1);
  });
});

describe("normalizeTrainServiceAlerts", () => {
  test("maps line codes to display names, dedupes lines, and marks disruptions", () => {
    const alerts = normalizeTrainServiceAlerts({
      value: [
        {
          Status: 2,
          StatusDescription: "Disrupted",
          Message: [{ Content: "No train service between Buona Vista" }],
          AffectedSegments: [
            { Line: "EWL", Direction: "Both", Stations: ["EW21", "EW22"] },
            { Line: "NEL", Stations: ["NE1"] },
            { Line: "NEL", Stations: ["NE7"] },
            { Line: "PEL", Stations: ["PE1"] },
            { Line: "XYZ", Stations: ["XY1"] },
          ],
          Start_time: "2026-09-09T08:15:00",
          End_time: null,
        },
      ],
    });

    expect(alerts).toHaveLength(1);
    expect(alerts[0].status).toBe("disrupted");
    expect(alerts[0].affectedLines).toEqual([
      "East West Line",
      "North East Line",
      "Punggol LRT East Loop",
      "XYZ",
    ]);
    expect(alerts[0].affectedStations).toEqual([
      "EW21",
      "EW22",
      "NE1",
      "NE7",
      "PE1",
      "XY1",
    ]);
    expect(alerts[0].startTime).toBe("2026-09-09T08:15:00");
    expect(alerts[0].endTime).toBe(null);
  });

  test("tolerates the all-clear wrapper, string statuses, and a missing Status", () => {
    const allClear = normalizeTrainServiceAlerts({
      value: { Status: 1, Message: [{ Content: "Normal service" }] },
    });
    expect(allClear[0].status).toBe("normal");
    expect(allClear[0].affectedLines).toEqual([]);
    expect(allClear[0].message).toBe("Normal service");

    const stringStatus = normalizeTrainServiceAlerts({
      value: [{ Status: "2", AffectedSegments: [{ Line: "CCL" }] }],
    });
    expect(stringStatus[0].status).toBe("disrupted");
    expect(stringStatus[0].affectedLines).toEqual(["Circle Line"]);

    const noStatus = normalizeTrainServiceAlerts({
      value: [{ Message: [{ Content: "Train service is running normally." }] }],
    });
    expect(noStatus[0].status).toBe("normal");
  });
});
