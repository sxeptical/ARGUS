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
    expect(digest[2]?.tone).toBe("danger");
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

  test("only emits a weather signal above PSI 100", () => {
    expect(buildSignalDigest({ trainAlerts: [], incidents: [], weather: weather("Moderate", 100) })).toEqual([]);
    expect(
      buildSignalDigest({ trainAlerts: [], incidents: [], weather: weather("Very Unhealthy", 250) }),
    ).toEqual([{ id: "weather:psi-unhealthy", category: "weather", tone: "danger", text: "PSI 250 (Very Unhealthy)" }]);
  });

  test("keeps ids stable when a signal's wording or reading changes", () => {
    const build = (message: string, psi: number) =>
      buildSignalDigest({
        trainAlerts: [{ status: "disrupted", affectedLines: ["NSL", "EWL"], message, affectedStations: [], startTime: "2026-11-02T08:00", endTime: null }],
        incidents: [{ id: "abc", type: "Accident", lat: 1, lng: 103, message: "Road blocked" }],
        weather: weather("Unhealthy", psi),
      }).map((row) => row.id);
    expect(build("Delays.", 120)).toEqual(build("Service restored soon.", 180));
    expect(build("Delays.", 120)).toEqual([
      "rail:EWL,NSL:2026-11-02T08:00",
      "road:abc",
      "weather:psi-unhealthy",
    ]);
  });

  test("gives a disruption that spreads to another line a new id", () => {
    const railId = (affectedLines: string[]) =>
      buildSignalDigest({
        trainAlerts: [{ status: "disrupted", affectedLines, message: "Delays.", affectedStations: [], startTime: null, endTime: null }],
        incidents: [],
        weather: weather("Good"),
      })[0]?.id;
    expect(railId(["EWL"])).not.toBe(railId(["EWL", "NSL"]));
    expect(railId([])).toBe("rail:network:unknown");
  });
});
