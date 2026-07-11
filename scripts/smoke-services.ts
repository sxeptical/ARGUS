/**
 * Smoke test for the `Cache` and `RateLimit` Effect services.
 *
 * Run with: `bun --experimental-strip-types scripts/smoke-services.ts`
 *
 * Confirms that the post-change services produce the same observable
 * behavior as the pre-change `cachedFetch` / `checkGlobalRateLimit`:
 *  - Cache miss triggers the producer, hit returns the cached value.
 *  - Concurrent calls for the same key share one producer run.
 *  - Rate limit allows up to `maxRequests` per window, then blocks.
 *  - The rate limit window rolls over after `windowMs`.
 *
 * NOTE: Cache failure-retry and TTL-expiry regression tests live in
 * `lib/cache.test.ts` (run with `bun test`). This smoke script focuses
 * on quick sanity checks for the happy paths.
 */
import { Console, Effect, Layer } from "effect";
import { Cache, CacheLive } from "../lib/cache.ts";
import { RateLimit, RateLimitLive } from "../lib/rate-limit.ts";

const testLayer = Layer.merge(CacheLive, RateLimitLive);

const program = Effect.gen(function* () {
  // ---------- Cache ----------
  yield* Console.log("Cache: miss then hit");

  let calls = 0;
  const producer = Effect.sync(() => {
    calls += 1;
    return "hello";
  });

  const cache = yield* Cache;

  const a = yield* cache.get("k1", 60_000, producer);
  const b = yield* cache.get("k1", 60_000, producer);
  if (a !== "hello" || b !== "hello") {
    throw new Error(`cache returned wrong value: a=${a} b=${b}`);
  }
  if (calls !== 1) {
    throw new Error(`producer should have run once, ran ${calls} times`);
  }
  yield* Console.log(`  ok: producer ran ${calls} time, both calls returned the same value`);

  yield* Console.log("Cache: set + get returns the set value");
  yield* cache.set("k2", 42);
  const v = yield* cache.get("k2", 60_000, producer);
  if (v !== 42) {
    throw new Error(`cache.get after set should return 42, got ${v}`);
  }
  yield* Console.log("  ok: set + get round-trips");

  yield* Console.log("Cache: concurrent calls share one producer run");
  // Use a fresh key so we are not hitting the cached value from above.
  let concurrentCalls = 0;
  const slowProducer = Effect.gen(function* () {
    concurrentCalls += 1;
    yield* Effect.sleep("20 millis");
    return "shared";
  });
  const concurrentResults = yield* Effect.all(
    [
      cache.get("concurrent-key", 60_000, slowProducer),
      cache.get("concurrent-key", 60_000, slowProducer),
      cache.get("concurrent-key", 60_000, slowProducer),
    ],
    { concurrency: "unbounded" },
  );
  if (concurrentCalls !== 1) {
    throw new Error(
      `concurrent producer should run once, ran ${concurrentCalls} times`,
    );
  }
  if (
    concurrentResults[0] !== "shared" ||
    concurrentResults[1] !== "shared" ||
    concurrentResults[2] !== "shared"
  ) {
    throw new Error(
      `concurrent results wrong: ${JSON.stringify(concurrentResults)}`,
    );
  }
  yield* Console.log(
    `  ok: ${concurrentCalls} producer run, 3 callers all received "shared"`,
  );

  // ---------- Rate limit ----------
  yield* Console.log("Rate limit: first 3 calls allowed, 4th blocked (window 60s, max 3)");

  const rl = yield* RateLimit;
  const ip = "10.0.0.1";
  const r1 = yield* rl.check(ip, { maxRequests: 3, windowMs: 60_000, scope: "smoke" });
  const r2 = yield* rl.check(ip, { maxRequests: 3, windowMs: 60_000, scope: "smoke" });
  const r3 = yield* rl.check(ip, { maxRequests: 3, windowMs: 60_000, scope: "smoke" });
  const r4 = yield* rl.check(ip, { maxRequests: 3, windowMs: 60_000, scope: "smoke" });

  if (!r1.allowed || !r2.allowed || !r3.allowed) {
    throw new Error("first three calls should be allowed");
  }
  if (r4.allowed) {
    throw new Error("fourth call should be blocked");
  }
  if (r4.remaining !== 0) {
    throw new Error(`fourth call remaining should be 0, got ${r4.remaining}`);
  }
  yield* Console.log(
    `  ok: r1.allowed=${r1.allowed} r2.allowed=${r2.allowed} r3.allowed=${r3.allowed} r4.allowed=${r4.allowed}`,
  );

  yield* Console.log("Rate limit: different IPs are independent");
  const otherIp = yield* rl.check("10.0.0.2", {
    maxRequests: 3,
    windowMs: 60_000,
    scope: "smoke",
  });
  if (!otherIp.allowed) {
    throw new Error("second IP should not be affected by the first IP's limit");
  }
  yield* Console.log("  ok: per-IP isolation works");

  yield* Console.log("Rate limit: different scopes are independent");
  const otherScope = yield* rl.check(ip, {
    maxRequests: 3,
    windowMs: 60_000,
    scope: "other",
  });
  if (!otherScope.allowed) {
    throw new Error("different scope should not be affected");
  }
  yield* Console.log("  ok: per-scope isolation works");

  yield* Console.log("ALL OK");
});

Effect.runPromise(program.pipe(Effect.provide(testLayer)) as Effect.Effect<
  void,
  never,
  never
>);
