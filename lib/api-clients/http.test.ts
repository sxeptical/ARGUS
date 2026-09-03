import { describe, expect, test } from "bun:test";
import { FetchHttpClient } from "@effect/platform";
import { Effect, Schema } from "effect";
import {
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
} from "@/lib/errors";
import { httpGetJson, toAppHttpError } from "./http";

const TestSchema = Schema.Struct({ ok: Schema.Boolean, count: Schema.Number });

const runWithFetch = (
  fetchImpl: (input: string | URL | Request) => Promise<Response>,
  timeoutMs = 10_000,
) =>
  Effect.runPromiseExit(
    httpGetJson(
      "test",
      "https://example.test/data",
      { Accept: "application/json" },
      TestSchema,
      timeoutMs,
    ).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetchImpl as unknown as typeof fetch,
      ),
    ),
  );

describe("toAppHttpError", () => {
  test("passes a TimeoutError through unchanged", () => {
    const error = new TimeoutError({ service: "test", message: "slow" });
    expect(toAppHttpError("test", error)).toBe(error);
  });

  test("converts a TimeoutException into a TimeoutError for the service", () => {
    const error = toAppHttpError("test", { _tag: "TimeoutException" });
    expect(error).toBeInstanceOf(TimeoutError);
    expect(error.service).toBe("test");
  });

  test("passes SchemaParseError and ExternalApiError through unchanged", () => {
    const schemaError = new SchemaParseError({
      service: "test",
      message: "bad",
    });
    const apiError = new ExternalApiError({
      service: "test",
      message: "down",
      status: 503,
    });
    expect(toAppHttpError("test", schemaError)).toBe(schemaError);
    expect(toAppHttpError("test", apiError)).toBe(apiError);
  });

  test("maps a body decode failure (ResponseError reason Decode) to SchemaParseError", () => {
    const error = toAppHttpError("test", {
      _tag: "ResponseError",
      reason: "Decode",
    });
    expect(error).toBeInstanceOf(SchemaParseError);
    expect(error.service).toBe("test");
  });

  test("maps a non-decode ResponseError to a 502 ExternalApiError", () => {
    const error = toAppHttpError("test", {
      _tag: "ResponseError",
      reason: "Timeout",
    });
    expect(error).toBeInstanceOf(ExternalApiError);
    if (!(error instanceof ExternalApiError)) return;
    expect(error.status).toBe(502);
  });

  test("maps an unknown failure to a 502 ExternalApiError", () => {
    const error = toAppHttpError("test", new Error("socket hang up"));
    expect(error).toBeInstanceOf(ExternalApiError);
    if (!(error instanceof ExternalApiError)) return;
    expect(error.status).toBe(502);
    expect(error.message).toContain("socket hang up");
  });
});

describe("httpGetJson", () => {
  test("decodes a successful response against the schema", async () => {
    const exit = await runWithFetch(async () =>
      Response.json({ ok: true, count: 3 }),
    );
    expect(exit._tag).toBe("Success");
    if (exit._tag !== "Success") return;
    expect(exit.value).toEqual({ ok: true, count: 3 });
  });

  test("a 404 becomes an ExternalApiError with status 404", async () => {
    const exit = await runWithFetch(async () =>
      new Response("not found", { status: 404 }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    const error = exit.cause.error;
    expect(error).toBeInstanceOf(ExternalApiError);
    if (!(error instanceof ExternalApiError)) return;
    expect(error.status).toBe(404);
  });

  test("a non-2xx status becomes an ExternalApiError carrying that status", async () => {
    const exit = await runWithFetch(async () =>
      new Response("unavailable", { status: 503 }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    const error = exit.cause.error;
    expect(error).toBeInstanceOf(ExternalApiError);
    if (!(error instanceof ExternalApiError)) return;
    expect(error.status).toBe(503);
  });

  test("a body that is not JSON becomes a SchemaParseError", async () => {
    const exit = await runWithFetch(async () =>
      new Response("not json at all", { status: 200 }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    expect(exit.cause.error).toBeInstanceOf(SchemaParseError);
  });

  test("a body that fails schema validation becomes a SchemaParseError", async () => {
    const exit = await runWithFetch(async () =>
      Response.json({ ok: "yes", count: "three" }),
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    const error = exit.cause.error;
    expect(error).toBeInstanceOf(SchemaParseError);
    if (!(error instanceof SchemaParseError)) return;
    expect(error.service).toBe("test");
  });

  test("a request that never settles becomes a TimeoutError", async () => {
    const exit = await runWithFetch(
      () => new Promise<Response>(() => {}),
      25,
    );
    expect(exit._tag).toBe("Failure");
    if (exit._tag !== "Failure" || exit.cause._tag !== "Fail") return;
    expect(exit.cause.error).toBeInstanceOf(TimeoutError);
    expect(exit.cause.error.service).toBe("test");
  });
});
