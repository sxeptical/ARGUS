import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { Cache, CacheLive } from "./cache";

describe("Cache", () => {
  describe("failed producer retry", () => {
    test("a failed producer is retried on the next get (not permanently cached)", () => {
      const cache = Effect.runSync(
        Cache.pipe(Effect.provide(CacheLive)),
      );

      let attempts = 0;
      const flakyProducer = Effect.gen(function* () {
        attempts += 1;
        if (attempts < 3) {
          return yield* Effect.fail("transient error" as const);
        }
        return "recovered";
      });

      // First call fails
      const result1 = Effect.runSyncExit(
        cache.get("flaky", 60_000, flakyProducer),
      );
      expect(result1._tag).toBe("Failure");

      // Second call also fails (attempt 2)
      const result2 = Effect.runSyncExit(
        cache.get("flaky", 60_000, flakyProducer),
      );
      expect(result2._tag).toBe("Failure");

      // Third call succeeds (attempt 3) — proves the key was not poisoned
      const result3 = Effect.runSync(
        cache.get("flaky", 60_000, flakyProducer),
      );
      expect(result3).toBe("recovered");
      expect(attempts).toBe(3);
    });

    test("failure does not cache the error — next caller re-runs producer", () => {
      const cache = Effect.runSync(
        Cache.pipe(Effect.provide(CacheLive)),
      );

      let calls = 0;
      const failThenSucceed = Effect.gen(function* () {
        calls += 1;
        if (calls === 1) {
          return yield* Effect.fail("boom" as const);
        }
        return "ok";
      });

      // First call fails
      const exit1 = Effect.runSyncExit(
        cache.get("fail-then-ok", 60_000, failThenSucceed),
      );
      expect(exit1._tag).toBe("Failure");

      // Second call succeeds — proves failure was NOT cached
      const val = Effect.runSync(
        cache.get("fail-then-ok", 60_000, failThenSucceed),
      );
      expect(val).toBe("ok");
      expect(calls).toBe(2);
    });
  });

  describe("concurrent callers", () => {
    test("concurrent callers for the same key share one successful producer", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* Cache;

        let producerRuns = 0;
        const slowProducer = Effect.gen(function* () {
          producerRuns += 1;
          yield* Effect.sleep("30 millis");
          return "shared-value";
        });

        const results = yield* Effect.all(
          [
            cache.get("conc-key", 60_000, slowProducer),
            cache.get("conc-key", 60_000, slowProducer),
            cache.get("conc-key", 60_000, slowProducer),
          ],
          { concurrency: "unbounded" },
        );

        return { producerRuns, results };
      });

      const { producerRuns, results } = await Effect.runPromise(
        program.pipe(Effect.provide(CacheLive)),
      );

      expect(producerRuns).toBe(1);
      expect(results).toEqual(["shared-value", "shared-value", "shared-value"]);
    });

    test("concurrent failures are cleaned up and allow retry", async () => {
      const program = Effect.gen(function* () {
        const cache = yield* Cache;

        let calls = 0;
        const flakyConcurrent = Effect.gen(function* () {
          calls += 1;
          yield* Effect.sleep("10 millis");
          if (calls === 1) {
            return yield* Effect.fail("concurrent-boom" as const);
          }
          return "concurrent-ok";
        });

        // All 3 concurrent callers see the same failure
        const exit1 = yield* Effect.exit(
          Effect.all(
            [
              cache.get("conc-fail", 60_000, flakyConcurrent),
              cache.get("conc-fail", 60_000, flakyConcurrent),
              cache.get("conc-fail", 60_000, flakyConcurrent),
            ],
            { concurrency: "unbounded" },
          ),
        );

        // Subsequent call retries and succeeds
        const val = yield* cache.get("conc-fail", 60_000, flakyConcurrent);

        return { exitTag: exit1._tag, val, calls };
      });

      const { exitTag, val, calls } = await Effect.runPromise(
        program.pipe(Effect.provide(CacheLive)),
      );

      expect(exitTag).toBe("Failure");
      expect(val).toBe("concurrent-ok");
      expect(calls).toBeGreaterThanOrEqual(2);
    });
  });

  describe("TTL caching", () => {
    test("successful value is cached within TTL", () => {
      const cache = Effect.runSync(
        Cache.pipe(Effect.provide(CacheLive)),
      );

      let calls = 0;
      const producer = Effect.sync(() => {
        calls += 1;
        return "cached-val";
      });

      const v1 = Effect.runSync(cache.get("ttl-key", 60_000, producer));
      const v2 = Effect.runSync(cache.get("ttl-key", 60_000, producer));

      expect(v1).toBe("cached-val");
      expect(v2).toBe("cached-val");
      expect(calls).toBe(1);
    });

    test("value expires after TTL and producer runs again", () => {
      const cache = Effect.runSync(
        Cache.pipe(Effect.provide(CacheLive)),
      );

      let calls = 0;
      const producer = Effect.sync(() => {
        calls += 1;
        return "expire-val";
      });

      Effect.runSync(cache.get("expire-key", 1, producer));
      // busy-wait to let TTL expire
      const start = Date.now();
      while (Date.now() - start < 5) {
        /* spin */
      }
      Effect.runSync(cache.get("expire-key", 1, producer));

      expect(calls).toBe(2);
    });
  });

  describe("set + get round-trip", () => {
    test("set then get returns the set value", () => {
      const cache = Effect.runSync(
        Cache.pipe(Effect.provide(CacheLive)),
      );

      Effect.runSync(cache.set("set-key", 99));
      const v = Effect.runSync(
        cache.get("set-key", 60_000, Effect.sync(() => 0)),
      );
      expect(v).toBe(99);
    });
  });

  describe("clear", () => {
    test("clearing a specific key forces a fresh producer call", () => {
      const cache = Effect.runSync(
        Cache.pipe(Effect.provide(CacheLive)),
      );

      let calls = 0;
      const producer = Effect.sync(() => {
        calls += 1;
        return "cleared";
      });

      Effect.runSync(cache.get("clear-key", 60_000, producer));
      expect(calls).toBe(1);

      Effect.runSync(cache.clear("clear-key"));

      Effect.runSync(cache.get("clear-key", 60_000, producer));
      expect(calls).toBe(2);
    });
  });
});
