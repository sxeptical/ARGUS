import { afterEach, describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { extractClientIp, RateLimit, RateLimitLive } from "./rate-limit";

const originalVercel = process.env.VERCEL;
const originalTrustProxy = process.env.ARGUS_TRUST_PROXY_HEADERS;

afterEach(() => {
  if (originalVercel === undefined) {
    delete process.env.VERCEL;
  } else {
    process.env.VERCEL = originalVercel;
  }
  if (originalTrustProxy === undefined) {
    delete process.env.ARGUS_TRUST_PROXY_HEADERS;
  } else {
    process.env.ARGUS_TRUST_PROXY_HEADERS = originalTrustProxy;
  }
});

const requestWith = (headers: Record<string, string>): Request =>
  new Request("https://example.test/", { headers });

describe("extractClientIp", () => {
  test("trusts x-vercel-forwarded-for only when VERCEL=1", () => {
    process.env.VERCEL = "1";
    delete process.env.ARGUS_TRUST_PROXY_HEADERS;

    expect(
      extractClientIp(
        requestWith({ "x-vercel-forwarded-for": "203.0.113.9, 10.0.0.1" }),
      ),
    ).toBe("203.0.113.9");
  });

  test("ignores a spoofed x-vercel-forwarded-for on self-hosted deployments", () => {
    delete process.env.VERCEL;
    delete process.env.ARGUS_TRUST_PROXY_HEADERS;

    expect(
      extractClientIp(requestWith({ "x-vercel-forwarded-for": "198.51.100.7" })),
    ).toBe("unknown");
  });

  test("does not trust x-forwarded-for unless ARGUS_TRUST_PROXY_HEADERS is set", () => {
    delete process.env.VERCEL;
    delete process.env.ARGUS_TRUST_PROXY_HEADERS;

    expect(
      extractClientIp(requestWith({ "x-forwarded-for": "198.51.100.8" })),
    ).toBe("unknown");
  });

  test("trusts proxy headers only when ARGUS_TRUST_PROXY_HEADERS=true", () => {
    delete process.env.VERCEL;
    process.env.ARGUS_TRUST_PROXY_HEADERS = "true";

    expect(extractClientIp(requestWith({ "x-real-ip": "192.0.2.10" }))).toBe(
      "192.0.2.10",
    );
    expect(
      extractClientIp(requestWith({ "x-forwarded-for": "192.0.2.11, 10.1.1.1" })),
    ).toBe("192.0.2.11");
  });

  test("falls back to 127.0.0.1 when proxy trust is enabled but no header is present", () => {
    delete process.env.VERCEL;
    process.env.ARGUS_TRUST_PROXY_HEADERS = "true";

    expect(extractClientIp(requestWith({}))).toBe("127.0.0.1");
  });
});

describe("RateLimit service", () => {
  test("allows through the threshold and blocks the next request", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const limiter = yield* RateLimit;
        const first = yield* limiter.check("203.0.113.1", {
          scope: "threshold",
          maxRequests: 2,
          windowMs: 60_000,
        });
        const second = yield* limiter.check("203.0.113.1", {
          scope: "threshold",
          maxRequests: 2,
          windowMs: 60_000,
        });
        const third = yield* limiter.check("203.0.113.1", {
          scope: "threshold",
          maxRequests: 2,
          windowMs: 60_000,
        });
        return { first, second, third };
      }).pipe(Effect.provide(RateLimitLive)),
    );

    expect(result.first.allowed).toBe(true);
    expect(result.second.allowed).toBe(true);
    expect(result.second.remaining).toBe(0);
    expect(result.third.allowed).toBe(false);
  });

  test("resets after the window and isolates scopes", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const limiter = yield* RateLimit;
        yield* limiter.check("203.0.113.2", {
          scope: "one",
          maxRequests: 1,
          windowMs: 10,
        });
        const blocked = yield* limiter.check("203.0.113.2", {
          scope: "one",
          maxRequests: 1,
          windowMs: 10,
        });
        const otherScope = yield* limiter.check("203.0.113.2", {
          scope: "two",
          maxRequests: 1,
          windowMs: 10,
        });
        yield* Effect.sleep("15 millis");
        const reset = yield* limiter.check("203.0.113.2", {
          scope: "one",
          maxRequests: 1,
          windowMs: 10,
        });
        return { blocked, otherScope, reset };
      }).pipe(Effect.provide(RateLimitLive)),
    );

    expect(result.blocked.allowed).toBe(false);
    expect(result.otherScope.allowed).toBe(true);
    expect(result.reset.allowed).toBe(true);
  });
});
