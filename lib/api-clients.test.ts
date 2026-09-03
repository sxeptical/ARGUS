import { describe, expect, test } from "bun:test";
import { FetchHttpClient } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  BUS_ROUTES_MAX_PAGES,
  collectLtaPages,
  httpGetJson,
} from "./api-clients";
import { ExternalApiError, SchemaParseError, TimeoutError } from "./errors";

const fullPage = (skip: number, pageSize: number, idPrefix: string) =>
  Array.from({ length: pageSize }, (_, i) => `${idPrefix}-${skip + i}`);

describe("BUS_ROUTES_MAX_PAGES", () => {
  test("is high enough to cover the known national BusRoutes dataset", () => {
    // LTA returns at most 500 rows/page; current datasets are ~26–27k rows.
    expect(BUS_ROUTES_MAX_PAGES).toBeGreaterThan(40);
    expect(BUS_ROUTES_MAX_PAGES * 500).toBeGreaterThan(30_000);
  });
});

describe("collectLtaPages", () => {
  test("collects more than 40 full pages when the cap allows it", async () => {
    const pageSize = 500;
    const fullPages = 45;
    const tail = 120;
    const fetchedSkips: number[] = [];

    const rows = await Effect.runPromise(
      collectLtaPages(
        (skip) => {
          fetchedSkips.push(skip);
          const pageIndex = skip / pageSize;
          if (pageIndex < fullPages) {
            return Effect.succeed({
              value: fullPage(skip, pageSize, "row"),
            });
          }
          if (pageIndex === fullPages) {
            return Effect.succeed({
              value: fullPage(skip, tail, "row"),
            });
          }
          return Effect.succeed(null);
        },
        {
          pageSize,
          maxPages: BUS_ROUTES_MAX_PAGES,
          service: "lta",
          concurrency: 4,
        },
      ),
    );

    expect(rows).toHaveLength(fullPages * pageSize + tail);
    expect(rows[0]).toBe("row-0");
    expect(rows[40 * pageSize]).toBe(`row-${40 * pageSize}`);
    expect(fetchedSkips.length).toBeGreaterThan(40);
  });

  test("fails instead of returning a partial index when the cap is exhausted on a full page", async () => {
    const pageSize = 10;
    const maxPages = 40;
    let pagesServed = 0;

    const exit = await Effect.runPromiseExit(
      collectLtaPages(
        (skip) => {
          pagesServed += 1;
          return Effect.succeed({
            value: fullPage(skip, pageSize, "row"),
          });
        },
        {
          pageSize,
          maxPages,
          service: "lta",
          concurrency: 4,
        },
      ),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).status).toBe(502);
    expect((error as ExternalApiError).message).toContain("safety cap");
    expect(pagesServed).toBe(maxPages);
  });

  test("returns the collected rows when the last page under the cap is short", async () => {
    const pageSize = 10;
    const rows = await Effect.runPromise(
      collectLtaPages(
        (skip) => {
          if (skip >= 20) {
            return Effect.succeed({ value: ["last-a", "last-b"] });
          }
          return Effect.succeed({
            value: fullPage(skip, pageSize, "row"),
          });
        },
        { pageSize, maxPages: 40, service: "lta" },
      ),
    );

    expect(rows).toEqual([
      ...fullPage(0, 10, "row"),
      ...fullPage(10, 10, "row"),
      "last-a",
      "last-b",
    ]);
  });
});

describe("httpGetJson", () => {
  const EchoSchema = Schema.Struct({ ok: Schema.Boolean });

  const runWithFetch = <A, E>(
    program: Effect.Effect<A, E, import("@effect/platform/HttpClient").HttpClient>,
    fetchImpl: (input: string | URL | Request) => Promise<Response>,
  ) =>
    Effect.runPromiseExit(
      program.pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(
          FetchHttpClient.Fetch,
          fetchImpl as unknown as typeof fetch,
        ),
      ),
    );

  test("maps a 200 response with malformed JSON to SchemaParseError", async () => {
    const exit = await runWithFetch(
      httpGetJson(
        "lta",
        "https://example.test/payload",
        { Accept: "application/json" },
        EchoSchema,
        1_000,
      ),
      async () =>
        new Response("not-json{", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
    expect(error).toBeInstanceOf(SchemaParseError);
    expect((error as SchemaParseError)._tag).toBe("SchemaParseError");
  });

  test("times out when the response body never completes", async () => {
    const hangingBody = new ReadableStream<Uint8Array>({
      start() {
        // Intentionally never enqueue or close — headers have already been sent.
      },
    });

    const exit = await runWithFetch(
      httpGetJson(
        "lta",
        "https://example.test/hang",
        { Accept: "application/json" },
        EchoSchema,
        50,
      ),
      async () =>
        new Response(hangingBody, {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure") return;
    const error = exit.cause._tag === "Fail" ? exit.cause.error : null;
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError)._tag).toBe("TimeoutError");
  });

  test("decodes a well-formed JSON body", async () => {
    const exit = await runWithFetch(
      httpGetJson(
        "lta",
        "https://example.test/ok",
        { Accept: "application/json" },
        EchoSchema,
        1_000,
      ),
      async () =>
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value).toEqual({ ok: true });
  });
});
