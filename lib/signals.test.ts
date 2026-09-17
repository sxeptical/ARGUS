import { describe, expect, test } from "bun:test";
import { buildSignalDigest } from "@/lib/signals";
import type { WeatherData } from "@/types";

const weather = (psiStatus: WeatherData["psiStatus"], psi: number | null = 42) =>
  ({ psiStatus, psi } as WeatherData);

describe("buildSignalDigest", () => {
  test("orders rail, road, then weather signals", () => {
    const digest = buildSignalDigest({
      trainAlerts: [{ status: "disrupted", affectedLines: ["EWL", "NSL"], message: "No service. Use buses.", affectedStations: [], startTime: null, endTime: null }],
      incidents: [{ id: "1", type: "Accident", lat: 1, lng: 103, message: "Road blocked" }],
      weather: weather("Unhealthy", 151),
    });
    expect(digest.map((row) => row.category)).toEqual(["rail", "road", "weather"]);
    expect(digest[0]?.text).toBe("EWL, NSL: No service");
    expect(digest[2]?.text).toBe("PSI 151 (Unhealthy)");
  });

  test("maps incident tones and preserves the full road digest", () => {
    const digest = buildSignalDigest({
      trainAlerts: [],
      incidents: [
        { id: "1", type: "Accident", lat: 1, lng: 103, message: "a" },
        { id: "2", type: "Vehicle Breakdown", lat: 1, lng: 103, message: "b" },
        { id: "3", type: "Other", lat: 1, lng: 103, message: "c" },
      ],
      weather: weather("Good"),
    });
    expect(digest.map((row) => row.tone)).toEqual(["danger", "warning", "muted"]);
  });

  test("returns an empty digest for nominal empty inputs", () => {
    expect(buildSignalDigest({ trainAlerts: [], incidents: [], weather: weather("Good") })).toEqual([]);
  });

  test("only emits an unhealthy weather signal", () => {
    expect(buildSignalDigest({ trainAlerts: [], incidents: [], weather: weather("Moderate") })).toEqual([]);
  });
});
