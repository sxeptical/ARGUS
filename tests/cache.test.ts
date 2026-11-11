import { describe, expect, test } from "bun:test";
import { createCache } from "@/lib/cache";
import { ExternalApiError } from "@/lib/errors";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("cache", () => {
  describe("failed producer retry", () => {
    test("a failure is negatively cached instead of retried on every get", async () => {
      const cache = createCache();
      let attempts = 0;
      const flakyProducer = async () => {
        attempts += 1;
        throw new Error("transient error");
      };

      await expect(cache.get("flaky", 60_000, flakyProducer)).rejects.toThrow(
        "transient error",
      );
      await expect(cache.get("flaky", 60_000, flakyProducer)).rejects.toThrow(
        "transient error",
      );
      expect(attempts).toBe(1);
    });

    test("a failed producer is retried after the negative TTL", async () => {
      const cache = createCache();
      let attempts = 0;
      const flakyProducer = async () => {
        attempts += 1;
        if (attempts < 2) throw new Error("transient error");
        return "recovered";
      };

      await expect(
        cache.get("flaky", 60_000, flakyProducer, { negativeTtlMs: 1 }),
      ).rejects.toThrow("transient error");
      await sleep(5);
      expect(
        await cache.get("flaky", 60_000, flakyProducer, { negativeTtlMs: 1 }),
      ).toBe("recovered");
      expect(attempts).toBe(2);
    });

    test("re-throws the original error object and type", async () => {
      const cache = createCache();
      const failure = new ExternalApiError({
        service: "test",
        status: 503,
        message: "upstream down",
      });

      await expect(
        cache.get("typed", 60_000, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      await expect(
        cache.get("typed", 60_000, async () => {
          throw new Error("should not run");
        }),
      ).rejects.toBe(failure);
    });

    test("a producer that throws synchronously rejects instead of escaping", async () => {
      const cache = createCache();
      const producer = (): Promise<string> => {
        throw new Error("sync boom");
      };
      await expect(cache.get("sync", 60_000, producer)).rejects.toThrow(
        "sync boom",
      );
    });
  });

  describe("concurrent callers", () => {
    test("concurrent callers for the same key share one successful producer", async () => {
      const cache = createCache();
      let producerRuns = 0;
      const slowProducer = async () => {
        producerRuns += 1;
        await sleep(30);
        return "shared-value";
      };

      const results = await Promise.all([
        cache.get("conc-key", 60_000, slowProducer),
        cache.get("conc-key", 60_000, slowProducer),
        cache.get("conc-key", 60_000, slowProducer),
      ]);

      expect(producerRuns).toBe(1);
      expect(results).toEqual(["shared-value", "shared-value", "shared-value"]);
    });

    test("concurrent failures share one producer, are cleaned up, and allow retry", async () => {
      const cache = createCache();
      let calls = 0;
      const flakyConcurrent = async () => {
        calls += 1;
        await sleep(10);
        if (calls === 1) throw new Error("concurrent-boom");
        return "concurrent-ok";
      };

      const settled = await Promise.allSettled([
        cache.get("conc-fail", 60_000, flakyConcurrent, { negativeTtlMs: 1 }),
        cache.get("conc-fail", 60_000, flakyConcurrent, { negativeTtlMs: 1 }),
        cache.get("conc-fail", 60_000, flakyConcurrent, { negativeTtlMs: 1 }),
      ]);
      expect(settled.map((result) => result.status)).toEqual([
        "rejected",
        "rejected",
        "rejected",
      ]);
      expect(calls).toBe(1);

      await sleep(5);
      expect(
        await cache.get("conc-fail", 60_000, flakyConcurrent, {
          negativeTtlMs: 1,
        }),
      ).toBe("concurrent-ok");
      expect(calls).toBe(2);
    });
  });

  describe("TTL caching", () => {
    test("successful value is cached within TTL", async () => {
      const cache = createCache();
      let calls = 0;
      const producer = async () => {
        calls += 1;
        return "cached-val";
      };

      expect(await cache.get("ttl-key", 60_000, producer)).toBe("cached-val");
      expect(await cache.get("ttl-key", 60_000, producer)).toBe("cached-val");
      expect(calls).toBe(1);
    });

    test("value expires after TTL and producer runs again", async () => {
      const cache = createCache();
      let calls = 0;
      const producer = async () => {
        calls += 1;
        return "expire-val";
      };

      await cache.get("expire-key", 1, producer);
      await sleep(5);
      await cache.get("expire-key", 1, producer);

      expect(calls).toBe(2);
    });

    test("ttlForValue can shorten the lifetime of a partial result", async () => {
      const cache = createCache();
      let calls = 0;
      const producer = async () => {
        calls += 1;
        return { partial: true };
      };
      const options = { ttlForValue: () => 1 };

      await cache.get("partial-key", 60_000, producer, options);
      await sleep(5);
      await cache.get("partial-key", 60_000, producer, options);

      expect(calls).toBe(2);
    });
  });

  describe("caller abort", () => {
    test("aborting one caller does not cancel the shared producer", async () => {
      const cache = createCache();
      let runs = 0;
      const producer = async () => {
        runs += 1;
        await sleep(20);
        return "shared";
      };
      const controller = new AbortController();

      const aborted = cache.get("abort-key", 60_000, producer, {
        signal: controller.signal,
      });
      const other = cache.get("abort-key", 60_000, producer);
      controller.abort();

      await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
      expect(await other).toBe("shared");
      expect(runs).toBe(1);
      // The producer still populated the cache for later callers.
      expect(await cache.get("abort-key", 60_000, producer)).toBe("shared");
      expect(runs).toBe(1);
    });
  });

  describe("set", () => {
    test("set then get returns the set value without running the producer", async () => {
      const cache = createCache();
      cache.set("set-key", 99);
      expect(await cache.get("set-key", 60_000, async () => 0)).toBe(99);
    });
  });

  describe("peek", () => {
    test("reads a fresh value without running or caching a producer", async () => {
      const cache = createCache();
      await cache.get("snapshot", 60_000, async () => [1, 2, 3]);

      expect(cache.peek<number[]>("snapshot", 60_000)).toEqual([1, 2, 3]);
      expect(cache.peek("missing", 60_000)).toBeNull();
    });

    test("returns null for an expired value without overwriting it", async () => {
      const cache = createCache();
      await cache.get("old-snapshot", 60_000, async () => "last-good");
      await sleep(5);

      expect(cache.peek<string>("old-snapshot", 1)).toBeNull();
      // An expired peek must not overwrite the stored value.
      expect(cache.peek<string>("old-snapshot", 60_000)).toBe("last-good");
    });
  });

  describe("clear", () => {
    test("clearing a specific key forces a fresh producer call", async () => {
      const cache = createCache();
      let calls = 0;
      const producer = async () => {
        calls += 1;
        return "cleared";
      };

      await cache.get("clear-key", 60_000, producer);
      expect(calls).toBe(1);

      cache.clear("clear-key");

      await cache.get("clear-key", 60_000, producer);
      expect(calls).toBe(2);
    });
  });

  describe("instance isolation", () => {
    test("two caches do not share in-flight producers for the same key", async () => {
      const cache1 = createCache();
      const cache2 = createCache();

      const results = await Promise.all([
        cache1.get("shared-key", 60_000, async () => {
          await sleep(30);
          return "from-one";
        }),
        cache2.get("shared-key", 60_000, async () => {
          await sleep(30);
          return "from-two";
        }),
      ]);

      expect(results).toEqual(["from-one", "from-two"]);
    });

    test("clearing one cache does not drop another cache's in-flight producer", async () => {
      const cache1 = createCache();
      const cache2 = createCache();

      const second = cache2.get("shared-key", 60_000, async () => {
        await sleep(40);
        return "still-two";
      });

      await sleep(5);
      cache1.clear("shared-key");

      expect(await second).toBe("still-two");
    });
  });
});
