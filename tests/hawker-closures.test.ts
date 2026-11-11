import { describe, expect, test } from "bun:test";
import { HAWKER_CENTRES } from "@/lib/data/amenities";
import { HAWKER_CLOSURES, validateHawkerClosuresBundle } from "@/lib/data/hawker-closures";
import type { HawkerClosure } from "@/types";

const closure = (overrides: Partial<HawkerClosure> = {}): HawkerClosure => ({
  kind: "cleaning",
  start: "2026-12-12",
  end: "2026-12-15",
  remarks: null,
  ...overrides,
});

describe("hawker closures bundle", () => {
  test("joins a plausible set of NEA closure periods by hawker id", () => {
    expect(HAWKER_CLOSURES.size).toBeGreaterThan(100);
    expect(HAWKER_CENTRES.filter((hawker) => hawker.closures.length > 0)).toHaveLength(HAWKER_CLOSURES.size);
    const total = HAWKER_CENTRES.reduce((count, hawker) => count + hawker.closures.length, 0);
    expect(total).toBeGreaterThan(400);
    for (const hawker of HAWKER_CENTRES) {
      for (const period of hawker.closures) {
        expect(period.end >= period.start).toBe(true);
        expect(period.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(["cleaning", "other-works"]).toContain(period.kind);
      }
    }
    // Centres with no closure row (new/planned centres) get an empty list.
    expect(HAWKER_CENTRES.some((hawker) => hawker.closures.length === 0)).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateHawkerClosuresBundle({ "hawker-1": [closure()] })).toBe(true);
    expect(validateHawkerClosuresBundle({ "hawker-1": [closure({ kind: "fire-drill" as "cleaning" })] })).toBe(false);
    expect(validateHawkerClosuresBundle({ "hawker-1": [closure({ start: "12/12/2026" })] })).toBe(false);
    expect(validateHawkerClosuresBundle({ "hawker-1": [closure({ start: "2026-12-15", end: "2026-12-12" })] })).toBe(false);
    expect(validateHawkerClosuresBundle({ "hawker-1": [closure({ remarks: 42 as unknown as null })] })).toBe(false);
    expect(validateHawkerClosuresBundle({ "hawker-1": "soon" })).toBe(false);
    expect(validateHawkerClosuresBundle(null)).toBe(false);
    expect(validateHawkerClosuresBundle([closure()])).toBe(false);
  });
});
