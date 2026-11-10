import { afterEach, describe, expect, test } from "bun:test";
import { createRateLimiter, extractClientIp } from "@/lib/rate-limit";

const originalCloudflare = process.env.ARGUS_ON_CLOUDFLARE;
const originalTrustProxy = process.env.ARGUS_TRUST_PROXY_HEADERS;

afterEach(() => {
  if (originalCloudflare === undefined) {
    delete process.env.ARGUS_ON_CLOUDFLARE;
  } else {
    process.env.ARGUS_ON_CLOUDFLARE = originalCloudflare;
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
  test("trusts cf-connecting-ip only when ARGUS_ON_CLOUDFLARE=1", () => {
    process.env.ARGUS_ON_CLOUDFLARE = "1";
    delete process.env.ARGUS_TRUST_PROXY_HEADERS;

    expect(
      extractClientIp(requestWith({ "cf-connecting-ip": "203.0.113.9" })),
    ).toBe("203.0.113.9");
  });

  test("ignores a spoofed cf-connecting-ip on self-hosted deployments", () => {
    delete process.env.ARGUS_ON_CLOUDFLARE;
    delete process.env.ARGUS_TRUST_PROXY_HEADERS;

    expect(
      extractClientIp(requestWith({ "cf-connecting-ip": "198.51.100.7" })),
    ).toBe("unknown");
  });

  test("does not trust x-forwarded-for unless ARGUS_TRUST_PROXY_HEADERS is set", () => {
    delete process.env.ARGUS_ON_CLOUDFLARE;
    delete process.env.ARGUS_TRUST_PROXY_HEADERS;

    expect(
      extractClientIp(requestWith({ "x-forwarded-for": "198.51.100.8" })),
    ).toBe("unknown");
  });

  test("trusts proxy headers only when ARGUS_TRUST_PROXY_HEADERS=true", () => {
    delete process.env.ARGUS_ON_CLOUDFLARE;
    process.env.ARGUS_TRUST_PROXY_HEADERS = "true";

    expect(extractClientIp(requestWith({ "x-real-ip": "192.0.2.10" }))).toBe(
      "192.0.2.10",
    );
    expect(
      extractClientIp(requestWith({ "x-forwarded-for": "192.0.2.11, 10.1.1.1" })),
    ).toBe("192.0.2.11");
  });

  test("falls back to 127.0.0.1 when proxy trust is enabled but no header is present", () => {
    delete process.env.ARGUS_ON_CLOUDFLARE;
    process.env.ARGUS_TRUST_PROXY_HEADERS = "true";

    expect(extractClientIp(requestWith({}))).toBe("127.0.0.1");
  });
});

describe("rate limiter", () => {
  test("allows through the threshold and blocks the next request", () => {
    const limiter = createRateLimiter();
    const options = { scope: "threshold", maxRequests: 2, windowMs: 60_000 };
    const first = limiter.check("203.0.113.1", options);
    const second = limiter.check("203.0.113.1", options);
    const third = limiter.check("203.0.113.1", options);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(second.remaining).toBe(0);
    expect(third.allowed).toBe(false);
  });

  test("resets after the window and isolates scopes and IPs", async () => {
    const limiter = createRateLimiter();
    const one = { scope: "one", maxRequests: 1, windowMs: 10 };
    limiter.check("203.0.113.2", one);
    const blocked = limiter.check("203.0.113.2", one);
    const otherScope = limiter.check("203.0.113.2", { ...one, scope: "two" });
    const otherIp = limiter.check("203.0.113.3", one);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const reset = limiter.check("203.0.113.2", one);

    expect(blocked.allowed).toBe(false);
    expect(otherScope.allowed).toBe(true);
    expect(otherIp.allowed).toBe(true);
    expect(reset.allowed).toBe(true);
  });
});
