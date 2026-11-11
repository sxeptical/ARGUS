import { describe, expect, test } from "bun:test";
import { type RateLimitOptions } from "@/lib/rate-limit";
import {
  bindingNameForLimit,
  createRateLimitBackend,
  createSharedRateLimiter,
  type SharedRateLimitBackend,
} from "@/lib/shared-rate-limit";

const localDecision = {
  allowed: true,
  remaining: 7,
  resetMs: 1_234,
};

const localSpy = () => {
  const calls: Array<{ ip: string; options?: RateLimitOptions }> = [];
  return {
    calls,
    check(ip: string, options?: RateLimitOptions) {
      calls.push({ ip, options });
      return localDecision;
    },
  };
};

describe("bindingNameForLimit", () => {
  test("uses the exact binding for every configured route budget", () => {
    expect(bindingNameForLimit(60)).toBe("RATE_LIMITER_60");
    expect(bindingNameForLimit(90)).toBe("RATE_LIMITER_90");
    expect(bindingNameForLimit(120)).toBe("RATE_LIMITER_120");
    expect(bindingNameForLimit(300)).toBe("RATE_LIMITER_300");
  });

  test("falls back to the nearest lower binding, never looser", () => {
    expect(bindingNameForLimit(75)).toBe("RATE_LIMITER_60");
    expect(bindingNameForLimit(1)).toBe("RATE_LIMITER_60");
    expect(bindingNameForLimit(999)).toBe("RATE_LIMITER_300");
  });
});

describe("createRateLimitBackend", () => {
  const binding = (success: boolean) => ({
    calls: [] as string[],
    limit(options: { key: string }) {
      this.calls.push(options.key);
      return Promise.resolve({ success });
    },
  });

  test("routes the key to the binding for the requested budget", async () => {
    const sixty = binding(true);
    const oneTwenty = binding(false);
    const backend = createRateLimitBackend({
      RATE_LIMITER_60: sixty,
      RATE_LIMITER_120: oneTwenty,
    });

    await expect(
      backend.limit("bus-stops:203.0.113.1", { maxRequests: 60 }),
    ).resolves.toBe(true);
    await expect(
      backend.limit("cameras:203.0.113.1", { maxRequests: 120 }),
    ).resolves.toBe(false);

    expect(sixty.calls).toEqual(["bus-stops:203.0.113.1"]);
    expect(oneTwenty.calls).toEqual(["cameras:203.0.113.1"]);
  });

  test("throws when the mapped binding is missing so the caller can fall back", async () => {
    const backend = createRateLimitBackend({});
    await expect(
      backend.limit("global:unknown", { maxRequests: 60 }),
    ).rejects.toThrow("RATE_LIMITER_60");
  });
});

describe("createSharedRateLimiter", () => {
  const backend = (
    limit: SharedRateLimitBackend["limit"],
  ): SharedRateLimitBackend => ({ limit });

  test("uses the shared backend when it is available", async () => {
    const local = localSpy();
    const keys: string[] = [];
    const limiter = createSharedRateLimiter(local, () =>
      backend(async (key) => {
        keys.push(key);
        return true;
      }),
    );

    const decision = await limiter.check("203.0.113.9", {
      scope: "bus-stops",
      maxRequests: 60,
    });

    expect(decision.allowed).toBe(true);
    expect(keys).toEqual(["bus-stops:203.0.113.9"]);
    expect(local.calls).toHaveLength(0);
  });

  test("reports a full window when the shared backend denies", async () => {
    const local = localSpy();
    const limiter = createSharedRateLimiter(local, () =>
      backend(async () => false),
    );

    const decision = await limiter.check("203.0.113.9", {
      scope: "cameras",
      maxRequests: 120,
    });

    expect(decision).toEqual({ allowed: false, remaining: 0, resetMs: 60_000 });
    expect(local.calls).toHaveLength(0);
  });

  test("falls back to the local limiter when the backend throws", async () => {
    const local = localSpy();
    let calls = 0;
    const limiter = createSharedRateLimiter(local, () => {
      calls += 1;
      return backend(async () => {
        throw new Error("binding unavailable");
      });
    });

    const options = { scope: "news", maxRequests: 120 };
    expect(await limiter.check("203.0.113.9", options)).toBe(localDecision);
    expect(await limiter.check("203.0.113.9", options)).toBe(localDecision);

    expect(local.calls).toEqual([
      { ip: "203.0.113.9", options },
      { ip: "203.0.113.9", options },
    ]);
    // Resolution is cached even when a specific call fails.
    expect(calls).toBe(1);
  });

  test("uses the local limiter when no backend can be resolved", async () => {
    const local = localSpy();
    const limiter = createSharedRateLimiter(local, () => null);

    expect(await limiter.check("198.51.100.4")).toBe(localDecision);
    expect(local.calls).toEqual([{ ip: "198.51.100.4", options: {} }]);
  });

  test("falls back when backend resolution throws", async () => {
    const local = localSpy();
    const limiter = createSharedRateLimiter(local, () => {
      throw new Error("no request context");
    });

    const decision = await limiter.check("198.51.100.4", {
      scope: "weather",
      maxRequests: 120,
    });
    expect(decision).toBe(localDecision);
    expect(local.calls).toHaveLength(1);
  });
});
