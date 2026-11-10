import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
} from "@/lib/errors";
import { httpGetJson, withTimeout } from "@/lib/api-clients/http";
import { rejection, withFetch, type FetchStub } from "../helpers/upstream";

const TestSchema = z.object({ ok: z.boolean(), count: z.number() });

const getWith = (fetchImpl: FetchStub, timeoutMs = 10_000) =>
  withFetch(fetchImpl, () =>
    httpGetJson(
      "test",
      "https://example.test/data",
      { Accept: "application/json" },
      TestSchema,
      timeoutMs,
    ),
  );

describe("httpGetJson", () => {
  test("decodes a successful response against the schema", async () => {
    expect(
      await getWith(async () => Response.json({ ok: true, count: 3, extra: 1 })),
    ).toEqual({ ok: true, count: 3 });
  });

  test("sends the given headers", async () => {
    const accepts: Array<string | null> = [];
    await getWith(async (input, init) => {
      accepts.push(new Request(String(input), init).headers.get("Accept"));
      return Response.json({ ok: true, count: 1 });
    });
    expect(accepts).toEqual(["application/json"]);
  });

  test("a non-2xx status becomes an ExternalApiError carrying that status", async () => {
    for (const status of [404, 503]) {
      const error = await rejection(
        getWith(async () => new Response("nope", { status })),
      );
      expect(error).toBeInstanceOf(ExternalApiError);
      expect((error as ExternalApiError).status).toBe(status);
      expect((error as ExternalApiError).service).toBe("test");
    }
  });

  test("a network failure becomes a 502 ExternalApiError", async () => {
    const error = await rejection(
      getWith(async () => {
        throw new Error("socket hang up");
      }),
    );
    expect(error).toBeInstanceOf(ExternalApiError);
    expect((error as ExternalApiError).status).toBe(502);
    expect((error as ExternalApiError).message).toContain("socket hang up");
  });

  test("a body that is not JSON becomes a SchemaParseError", async () => {
    const error = await rejection(
      getWith(async () => new Response("not json at all", { status: 200 })),
    );
    expect(error).toBeInstanceOf(SchemaParseError);
  });

  test("a body that fails schema validation becomes a SchemaParseError", async () => {
    const error = await rejection(
      getWith(async () => Response.json({ ok: "yes", count: "three" })),
    );
    expect(error).toBeInstanceOf(SchemaParseError);
    expect((error as SchemaParseError).service).toBe("test");
  });

  test("a request that never settles becomes a TimeoutError and is aborted", async () => {
    let aborted = false;
    const error = await rejection(
      getWith((_input, init) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise<Response>(() => {});
      }, 25),
    );
    expect(error).toBeInstanceOf(TimeoutError);
    expect((error as TimeoutError).service).toBe("test");
    expect(aborted).toBe(true);
  });
});

describe("httpGetJson parent signal", () => {
  test("an aborted parent signal cancels the in-flight request", async () => {
    const controller = new AbortController();
    let fetchAborted = false;
    const pending = withFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          // Like real fetch, reject once the request signal aborts.
          init?.signal?.addEventListener("abort", () => {
            fetchAborted = true;
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
      () =>
        httpGetJson(
          "test",
          "https://example.test/data",
          {},
          TestSchema,
          10_000,
          controller.signal,
        ),
    );
    setTimeout(() => controller.abort(), 10);

    expect(await rejection(pending)).toBeInstanceOf(ExternalApiError);
    expect(fetchAborted).toBe(true);
  });
});

describe("withTimeout", () => {
  test("passes a fast result or failure straight through", async () => {
    expect(await withTimeout("test", 1_000, async () => "done")).toBe("done");
    const failure = new Error("boom");
    expect(
      await rejection(
        withTimeout("test", 1_000, async () => {
          throw failure;
        }),
      ),
    ).toBe(failure);
  });
});
