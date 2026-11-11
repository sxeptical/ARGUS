import { describe, expect, test } from "bun:test";
import { createCache } from "@/lib/cache";
import {
  createCacheApiL2,
  type CacheL2Storage,
} from "@/lib/cache-l2";

interface StoredEntry {
  readonly body: string;
  readonly cacheControl: string;
  readonly method: string;
  readonly url: string;
}

/** Minimal in-memory stand-in for the Workers Cache API. */
const createFakeStorage = () => {
  const entries = new Map<string, StoredEntry>();
  let puts = 0;
  const storage: CacheL2Storage = {
    match(request) {
      const entry = entries.get(request.url);
      if (!entry) return Promise.resolve(undefined);
      return Promise.resolve(
        new Response(entry.body, {
          headers: { "cache-control": entry.cacheControl },
        }),
      );
    },
    put(request, response) {
      puts += 1;
      return response.text().then((body) => {
        entries.set(request.url, {
          body,
          cacheControl: response.headers.get("cache-control") ?? "",
          method: request.method,
          url: request.url,
        });
      });
    },
  };
  return { entries, storage, puts: () => puts };
};

describe("createCacheApiL2", () => {
  test("is a no-op without a Cache API", () => {
    expect(createCacheApiL2(null)).toBeNull();
  });

  test("writes JSON with the caller TTL as max-age", async () => {
    const { entries, storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage);
    expect(l2).not.toBeNull();

    await l2!.put("bus-stops", { stops: [1, 2] }, 60_000);

    const [entry] = [...entries.values()];
    expect(entries.size).toBe(1);
    expect(entry?.method).toBe("GET");
    expect(entry?.cacheControl).toBe("public, max-age=60");
    expect(await l2!.get("bus-stops")).toEqual({ stops: [1, 2] });
  });

  test("uses distinct keys and returns undefined on a miss", async () => {
    const { storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage)!;

    await l2.put("a", 1, 60_000);
    await l2.put("b", 2, 60_000);

    expect(await l2.get("a")).toBe(1);
    expect(await l2.get("b")).toBe(2);
    expect(await l2.get("missing")).toBeUndefined();
  });

  test("skips values over the size cap", async () => {
    const { entries, storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage, { maxBytes: 10 })!;

    await l2.put("large", { body: "x".repeat(100) }, 60_000);

    expect(entries.size).toBe(0);
  });

  test("skips non-finite TTLs (cache.set entries)", async () => {
    const { entries, storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage)!;

    await l2.put("forever", "value", Number.POSITIVE_INFINITY);

    expect(entries.size).toBe(0);
  });

  test("swallows storage and JSON errors", async () => {
    const failing: CacheL2Storage = {
      match: () => Promise.reject(new Error("cache down")),
      put: () => Promise.reject(new Error("cache down")),
    };
    const l2 = createCacheApiL2(failing)!;

    expect(await l2.get("key")).toBeUndefined();
    await expect(l2.put("key", { ok: true }, 60_000)).resolves.toBeUndefined();

    const corrupt: CacheL2Storage = {
      match: () =>
        Promise.resolve(
          new Response("{ not json", {
            headers: { "content-type": "application/json" },
          }),
        ),
      put: () => Promise.resolve(),
    };
    expect(await createCacheApiL2(corrupt)!.get("key")).toBeUndefined();
  });
});

describe("cache L2 integration", () => {
  test("a new cache instance reuses an L2 value instead of calling the producer", async () => {
    const { storage, puts } = createFakeStorage();
    const l2 = createCacheApiL2(storage)!;
    let runs = 0;
    const producer = async () => {
      runs += 1;
      return ["public", "data"];
    };

    const first = createCache({ l2 });
    expect(
      await first.get("shared-key", 60_000, producer, { shared: true }),
    ).toEqual(["public", "data"]);
    expect(puts()).toBe(1);

    const second = createCache({ l2 });
    expect(
      await second.get("shared-key", 60_000, producer, { shared: true }),
    ).toEqual(["public", "data"]);
    expect(runs).toBe(1);
    // An L2 hit must not refresh the L2 TTL (that would make it sliding).
    expect(puts()).toBe(1);
  });

  test("keys without `shared` never touch L2", async () => {
    const { storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage)!;
    let runs = 0;
    const producer = async () => {
      runs += 1;
      return "local-only";
    };

    await createCache({ l2 }).get("local-key", 60_000, producer);
    await createCache({ l2 }).get("local-key", 60_000, producer);

    expect(runs).toBe(2);
    expect(
      await storage.match(
        new Request("https://l2.argus-cache.internal/v1/local-key"),
      ),
    ).toBeUndefined();
  });

  test("negative entries are never written to L2", async () => {
    const { storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage)!;
    const cache = createCache({ l2 });

    await expect(
      cache.get(
        "failure",
        60_000,
        async () => {
          throw new Error("upstream down");
        },
        { shared: true },
      ),
    ).rejects.toThrow("upstream down");

    expect(await l2.get("failure")).toBeUndefined();
  });

  test("a codec round-trips Map values", async () => {
    const { storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage)!;
    let runs = 0;
    const producer = async () => {
      runs += 1;
      return new Map([["12", [1, 2]]]);
    };
    const options = {
      shared: true,
      sharedCodec: {
        encode: (value: Map<string, number[]>) => Object.fromEntries(value),
        decode: (stored: unknown) =>
          new Map(Object.entries(stored as Record<string, number[]>)),
      },
    };

    expect(await createCache({ l2 }).get("map", 60_000, producer, options)).toEqual(
      new Map([["12", [1, 2]]]),
    );
    const reused = await createCache({ l2 }).get(
      "map",
      60_000,
      producer,
      options,
    );

    expect(reused).toEqual(new Map([["12", [1, 2]]]));
    expect(runs).toBe(1);
  });

  test("an incompatible L2 entry falls back to the producer", async () => {
    const { storage } = createFakeStorage();
    const l2 = createCacheApiL2(storage)!;
    await l2.put("map", {}, 60_000);
    let runs = 0;

    const value = await createCache({ l2 }).get(
      "map",
      60_000,
      async () => {
        runs += 1;
        return new Map([["12", [1, 2]]]);
      },
      {
        shared: true,
        sharedCodec: {
          encode: (map: Map<string, number[]>) => Object.fromEntries(map),
          decode: () => {
            throw new Error("old format");
          },
        },
      },
    );

    expect(value).toEqual(new Map([["12", [1, 2]]]));
    expect(runs).toBe(1);
  });
});
