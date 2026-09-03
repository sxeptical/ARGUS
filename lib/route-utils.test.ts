import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  BadRequestError,
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
  type AppError,
} from "./errors";
import type { AppContext } from "./effect-runtime";
import {
  BUS_SERVICE_NO_RE,
  BUS_STOP_ID_RE,
  handle,
  optionalQueryParam,
  requiredQueryParam,
} from "./route-utils";

const options = { maxRequests: 120, serviceLabel: "Test feed" };

const viaHandle = (
  produce: () => Effect.Effect<unknown, AppError, AppContext>,
) =>
  handle(
    new Request("https://example.test/feed"),
    crypto.randomUUID(),
    options,
    produce,
  );

const expectThrown = <T>(fn: () => T): unknown => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected the call to throw");
};

describe("requiredQueryParam / optionalQueryParam", () => {
  const base = "https://example.test/feed";

  test("required: missing value throws BadRequestError", () => {
    const error = expectThrown(() =>
      requiredQueryParam(
        new Request(base),
        "stopId",
        BUS_STOP_ID_RE,
        "must be a 5-digit bus stop code",
      ),
    );
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toBe(
      "Query param stopId is required",
    );
  });

  test("required: rejects a value that fails the pattern", () => {
    const error = expectThrown(() =>
      requiredQueryParam(
        new Request(`${base}?stopId=12e`),
        "stopId",
        BUS_STOP_ID_RE,
        "must be a 5-digit bus stop code",
      ),
    );
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toBe(
      "Query param stopId must be a 5-digit bus stop code",
    );
  });

  test("required: accepts a valid value", () => {
    expect(
      requiredQueryParam(
        new Request(`${base}?stopId=83121`),
        "stopId",
        BUS_STOP_ID_RE,
        "must be a 5-digit bus stop code",
      ),
    ).toBe("83121");
  });

  test("optional: absent returns undefined", () => {
    expect(
      optionalQueryParam(
        new Request(base),
        "service",
        BUS_SERVICE_NO_RE,
        "must be a bus service number",
      ),
    ).toBeUndefined();
  });

  test("optional: rejects an invalid value and passes a valid one", () => {
    const error = expectThrown(() =>
      optionalQueryParam(
        new Request(`${base}?service=!!`),
        "service",
        BUS_SERVICE_NO_RE,
        "must be a bus service number",
      ),
    );
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as BadRequestError).message).toBe(
      "Query param service must be a bus service number",
    );
    expect(
      optionalQueryParam(
        new Request(`${base}?service=12e`),
        "service",
        BUS_SERVICE_NO_RE,
        "must be a bus service number",
      ),
    ).toBe("12e");
  });
});

describe("handle", () => {
  test("returns the produced value as JSON on success", async () => {
    const response = await viaHandle(() =>
      Effect.succeed({ ok: true, items: [1, 2] }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, items: [1, 2] });
  });
});

describe("handle error mapping", () => {
  test("BadRequestError -> 400 with the message", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new BadRequestError({ message: "Query param stopId is required" }),
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Query param stopId is required",
    });
  });

  test("missing/placeholder API key (ExternalApiError 401) -> 500 misconfigured", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new ExternalApiError({
          service: "lta",
          message: "Missing LTA_API_KEY",
          status: 401,
        }),
      ),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Test feed is not configured",
    });
  });

  test("ExternalApiError 429 -> 429 with Retry-After: 60", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new ExternalApiError({
          service: "lta",
          message: "rate limited",
          status: 429,
        }),
      ),
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(await response.json()).toEqual({
      error: "Test feed is temporarily rate limited",
    });
  });

  test("ExternalApiError 404 -> 404 with the upstream message", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new ExternalApiError({
          service: "opensky",
          message: "opensky returned 404",
          status: 404,
        }),
      ),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "opensky returned 404" });
  });

  test("ExternalApiError 503 -> 502 bad gateway", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new ExternalApiError({
          service: "lta",
          message: "down",
          status: 503,
        }),
      ),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Test feed is temporarily unavailable",
    });
  });

  test("ExternalApiError 500 -> 502 temporarily unavailable", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new ExternalApiError({
          service: "lta",
          message: "server error",
          status: 500,
        }),
      ),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Test feed is temporarily unavailable",
    });
  });

  test("TimeoutError -> 504", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new TimeoutError({ service: "lta", message: "timed out" }),
      ),
    );
    expect(response.status).toBe(504);
    expect(await response.json()).toEqual({
      error: "Test feed timed out",
    });
  });

  test("SchemaParseError -> 502 unexpected response", async () => {
    const response = await viaHandle(() =>
      Effect.fail(
        new SchemaParseError({ service: "lta", message: "bad shape" }),
      ),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Test feed returned an unexpected response",
    });
  });
});

describe("handle producer contract violations", () => {
  test("a synchronous BadRequestError from produce -> 400", async () => {
    const response = await viaHandle(() => {
      throw new BadRequestError({ message: "Query param stopId is required" });
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Query param stopId is required",
    });
  });

  test("a synchronous unknown error from produce -> 500", async () => {
    const response = await viaHandle(() => {
      throw new Error("setup blew up");
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });

  test("a program that dies -> 500", async () => {
    const response = await viaHandle(() => Effect.die("boom"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});

describe("handle rate limiting", () => {
  test("blocks after the configured budget and sets rate-limit headers", async () => {
    const scope = "rl-budget";
    const request = new Request("https://example.test/feed");
    let invoked = 0;

    const first = await handle(
      request,
      scope,
      { maxRequests: 1, serviceLabel: "Test feed" },
      () => {
        invoked += 1;
        return Effect.succeed("ok");
      },
    );
    expect(first.status).toBe(200);
    expect(invoked).toBe(1);

    const second = await handle(
      request,
      scope,
      { maxRequests: 1, serviceLabel: "Test feed" },
      () => {
        invoked += 1;
        return Effect.succeed("ok");
      },
    );
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: "Too many requests" });
    expect(second.headers.get("Retry-After")).toBe("60");
    expect(second.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(
      Number(second.headers.get("X-RateLimit-Reset")),
    ).toBeGreaterThan(Math.floor(Date.now() / 1000));
    // The producer is not invoked for a denied request.
    expect(invoked).toBe(1);
  });
});
