import { describe, expect, test } from "bun:test";
import type { CarparkAvailability, EvChargingLocation } from "@/types";
import { carparkTone, describeCarpark, describeEvCharger, evChargerTone } from "./mobility";

const carpark = (overrides: Partial<CarparkAvailability> = {}): CarparkAvailability => ({
  id: "HDB:TPMN",
  name: "BLK 78B",
  area: "",
  agency: "HDB",
  lat: 1.33,
  lng: 103.84,
  carLots: 100,
  motorcycleLots: null,
  heavyLots: null,
  ...overrides,
});

const charger = (overrides: Partial<EvChargingLocation> = {}): EvChargingLocation => ({
  id: "abc",
  name: "CLARKE QUAY",
  address: "",
  lat: 1.29,
  lng: 103.84,
  available: 1,
  occupied: 1,
  total: 3,
  maxPowerKw: 50,
  hasDc: true,
  operators: [],
  plugTypes: [],
  ...overrides,
});

describe("carparkTone", () => {
  test("bands car lots into full, low, and available", () => {
    expect(carparkTone(carpark({ carLots: 0 }))).toBe("danger");
    expect(carparkTone(carpark({ carLots: 20 }))).toBe("warning");
    expect(carparkTone(carpark({ carLots: 21 }))).toBe("success");
    expect(carparkTone(carpark({ carLots: null, motorcycleLots: 5 }))).toBe("muted");
  });
});

describe("evChargerTone", () => {
  test("distinguishes free, all-busy, and unreported locations", () => {
    expect(evChargerTone(charger())).toBe("success");
    expect(evChargerTone(charger({ available: 0 }))).toBe("warning");
    expect(evChargerTone(charger({ available: 0, occupied: 0 }))).toBe("muted");
  });
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("describeCarpark", () => {
  test("spells out free lots per vehicle class with a status", () => {
    expect(texts(describeCarpark(carpark({ carLots: 139, motorcycleLots: 1 })))).toEqual([
      "BLK 78B",
      "Spaces available",
      "139 car lots free",
      "1 motorcycle lot free",
      "Live from LTA · updates every minute",
    ]);
    expect(describeCarpark(carpark({ carLots: 0 })).slice(1, 3)).toEqual([
      { text: "Full", kind: "status", tone: "danger" },
      { text: "No car lots free", kind: "count" },
    ]);
    expect(texts(describeCarpark(carpark({ carLots: 1 }))).slice(1, 3)).toEqual(["Filling up", "1 car lot free"]);
    expect(texts(describeCarpark(carpark({ carLots: null, heavyLots: 4 }))).slice(1, 3)).toEqual(["No car lot data", "4 heavy vehicle lots free"]);
  });
});

describe("describeEvCharger", () => {
  test("explains charger availability and speed", () => {
    expect(texts(describeEvCharger(charger({ operators: ["SP MOBILITY"] })))).toEqual([
      "CLARKE QUAY",
      "1 of 3 chargers free",
      "Up to 50 kW · DC fast charging",
      "Run by SP MOBILITY",
      "Live from LTA · updates every 5 minutes",
    ]);
    expect(describeEvCharger(charger({ available: 0, occupied: 3 }))[1].text).toBe("All 3 chargers in use");
    expect(describeEvCharger(charger({ available: 0, occupied: 2 }))[1].text).toBe("No free chargers · 2 in use");
    expect(describeEvCharger(charger({ available: 0, occupied: 0, maxPowerKw: 7.4, hasDc: false }))).toContainEqual({ text: "Up to 7.4 kW · AC standard charging", kind: "detail" });
  });
});
