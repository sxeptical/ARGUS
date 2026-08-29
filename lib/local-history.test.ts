import { describe, expect, test } from "bun:test";
import { mergePointLists, mergePointStores } from "./local-history";

type Point = { readonly timestamp: string; readonly value: number };

describe("local history merge", () => {
  test("merges chronologically and lets current state win on a timestamp", () => {
    const persisted: Point[] = [
      { timestamp: "2026-01-01T00:00:00.000Z", value: 1 },
      { timestamp: "2026-01-01T00:05:00.000Z", value: 2 },
    ];
    const current: Point[] = [
      { timestamp: "2026-01-01T00:05:00.000Z", value: 20 },
      { timestamp: "2026-01-01T00:10:00.000Z", value: 3 },
    ];

    expect(mergePointLists(persisted, current)).toEqual([
      persisted[0],
      current[0],
      current[1],
    ]);
  });

  test("merges keyed series instead of replacing data recorded before hydration", () => {
    const persisted = {
      service: [{ timestamp: "2026-01-01T00:00:00.000Z", value: 1 }],
    };
    const current = {
      service: [{ timestamp: "2026-01-01T00:05:00.000Z", value: 2 }],
    };
    expect(mergePointStores(persisted, current).service).toHaveLength(2);
  });
});
