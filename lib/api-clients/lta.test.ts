import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FetchHttpClient } from "@effect/platform";
import { Effect } from "effect";
import { CacheLive } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";
import { collectLtaPages, getTrafficCameras } from "./lta";

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
