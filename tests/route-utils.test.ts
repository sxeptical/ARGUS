import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  BadRequestError,
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
  type AppError,
} from "@/lib/errors";
import type { AppContext } from "@/lib/effect-runtime";
import {
  BUS_SERVICE_NO_RE,
  BUS_STOP_ID_RE,
  handle,
  optionalQueryParam,
  requiredQueryParam,
} from "@/lib/route-utils";

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
  const cases: Array<{
    name: string;
    error: AppError;
    status: number;
    body: { error: string };
    retryAfter?: string;
  }> = [
    {
      name: "BadRequestError -> 400 with the message",
      error: new BadRequestError({ message: "Query param stopId is required" }),
      status: 400,
      body: { error: "Query param stopId is required" },
    },
    {
      name: "missing/placeholder API key (ExternalApiError 401) -> 500 misconfigured",
      error: new ExternalApiError({
        service: "lta",
        message: "Missing LTA_API_KEY",
        status: 401,
      }),
      status: 500,
      body: { error: "Test feed is not configured" },
    },
    {
      name: "ExternalApiError 429 -> 429 with Retry-After: 60",
      error: new ExternalApiError({
        service: "lta",
        message: "rate limited",
        status: 429,
      }),
      status: 429,
      retryAfter: "60",
      body: { error: "Test feed is temporarily rate limited" },
    },
    {
      name: "ExternalApiError 404 -> 404 with the upstream message",
      error: new ExternalApiError({
        service: "opensky",
        message: "opensky returned 404",
        status: 404,
      }),
      status: 404,
      body: { error: "opensky returned 404" },
    },
    {
      name: "ExternalApiError 503 -> 502 bad gateway",
      error: new ExternalApiError({
        service: "lta",
        message: "down",
        status: 503,
      }),
      status: 502,
      body: { error: "Test feed is temporarily unavailable" },
    },
    {
      name: "ExternalApiError 500 -> 502 temporarily unavailable",
      error: new ExternalApiError({
        service: "lta",
        message: "server error",
        status: 500,
      }),
      status: 502,
      body: { error: "Test feed is temporarily unavailable" },
    },
    {
      name: "TimeoutError -> 504",
      error: new TimeoutError({ service: "lta", message: "timed out" }),
      status: 504,
      body: { error: "Test feed timed out" },
    },
    {
      name: "SchemaParseError -> 502 unexpected response",
      error: new SchemaParseError({ service: "lta", message: "bad shape" }),
      status: 502,
      body: { error: "Test feed returned an unexpected response" },
    },
  ];

  test("maps every app error to its HTTP status, headers, and body", async () => {
    for (const { name, error, status, body, retryAfter } of cases) {
      const response = await viaHandle(() => Effect.fail(error));
      expect(response.status, name).toBe(status);
      if (retryAfter !== undefined) {
        expect(response.headers.get("Retry-After"), name).toBe(retryAfter);
      }
      expect(await response.json(), name).toEqual(body);
    }
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
