import { describe, expect, test } from "bun:test";
import { buildSignalDigest, unknownSignalIds } from "@/lib/signals";
import { signalTitle } from "@/lib/notifications";
import {
  nearestArea,
  singaporeDate,
  summarizeRain,
  summarizeLightning,
} from "@/lib/weather-alerts";
import type { WeatherData } from "@/types";

const AREAS = [
  { name: "Bedok", lat: 1.321, lng: 103.924 },
  { name: "Jurong West", lat: 1.34, lng: 103.705 },
  { name: "City", lat: 1.292, lng: 103.844 },
];

const NOW = Date.parse("2026-11-20T16:00:00+08:00");

const strike = (lat: number, lng: number, at: string, type = "C") => ({
  location: { latitude: lat, longitude: lng },
  type,
  datetime: at,
});

describe("nearestArea", () => {
  test("picks the closest label, within the limit", () => {
    expect(nearestArea(AREAS, 1.33, 103.93)).toBe("Bedok");
    expect(nearestArea(AREAS, 1.5, 104.25, 8_000)).toBeNull();
  });
});

describe("summarizeLightning", () => {
  test("counts recent strikes near Singapore, ranked by area", () => {
    const alert = summarizeLightning(
      {
        data: {
          records: [
            {
              datetime: "2026-11-20T15:58:00+08:00",
              item: {
                readings: [
                  strike(1.325, 103.93, "2026-11-20T15:57:10+08:00", "G"),
                  strike(1.318, 103.92, "2026-11-20T15:57:20+08:00"),
                  strike(1.29, 103.85, "2026-11-20T15:50:00+08:00"),
                  // Over the sea off Johor: too far from any area.
                  strike(1.5, 104.25, "2026-11-20T15:57:30+08:00", "G"),
                ],
              },
            },
            {
              datetime: "2026-11-20T15:20:00+08:00",
              // Older than the 30-minute window.
              item: { readings: [strike(1.34, 103.7, "2026-11-20T15:19:00+08:00", "G")] },
            },
          ],
        },
      },
      AREAS,
      NOW,
    );
    expect(alert).toEqual({
      strikes: 3,
      groundStrikes: 1,
      areas: ["Bedok", "City"],
      lastStrikeAt: "2026-11-20T15:57:20+08:00",
    });
  });

  test("no nearby strikes reads as zero, including empty records", () => {
    expect(
      summarizeLightning(
        { data: { records: [{ datetime: "2026-11-20T15:58:00+08:00", item: { readings: [] } }] } },
        AREAS,
        NOW,
      ),
    ).toEqual({ strikes: 0, groundStrikes: 0, areas: [], lastStrikeAt: null });
  });

  test("a stalled or empty feed is unknown, not calm", () => {
    const stalled = { datetime: "2026-11-20T15:30:00+08:00", item: { readings: [] } };
    expect(summarizeLightning({ data: { records: [stalled] } }, AREAS, NOW)).toBeNull();
    expect(summarizeLightning({ data: { records: [] } }, AREAS, NOW)).toBeNull();
  });
});

describe("summarizeRain", () => {
  const stations = [
    { id: "S1", location: { latitude: 1.34, longitude: 103.71 } },
    { id: "S2", location: { latitude: 1.32, longitude: 103.92 } },
  ];
  const reading = (timestamp: string, s1: number, s2: number) => ({
    timestamp,
    data: [
      { stationId: "S1", value: s1 },
      { stationId: "S2", value: s2 },
    ],
  });

  /** Five-minute readings ending at 15:55, oldest first: [S1, S2] per reading. */
  const series = (values: ReadonlyArray<readonly [number, number]>) =>
    values
      .map(([s1, s2], index) => {
        const minutesBefore = (values.length - 1 - index) * 5;
        const at = Date.parse("2026-11-20T15:55:00+08:00") - minutesBefore * 60_000;
        return reading(new Date(at).toISOString(), s1, s2);
      })
      .reverse();

  test("sums the last 15 minutes per gauge and flags 5 mm or more as heavy", () => {
    const stats = summarizeRain(
      {
        data: {
          stations,
          readings: [
            reading("2026-11-20T15:55:00+08:00", 2.4, 1),
            reading("2026-11-20T15:50:00+08:00", 2, 1),
            reading("2026-11-20T15:45:00+08:00", 1.2, 1),
            // Outside the current window; S2's wettest 15 minutes are 4 mm.
            reading("2026-11-20T15:40:00+08:00", 0, 2),
          ],
        },
      },
      AREAS,
      NOW,
    );
    expect(stats).toEqual({
      observedAt: new Date("2026-11-20T15:55:00+08:00").toISOString(),
      stationCount: 2,
      rainingStations: 2,
      maxMm: 5.6,
      peakMm: 5.6,
      rainingAreas: ["Jurong West", "Bedok"],
      heavyAreas: ["Jurong West"],
    });
  });

  test("light rain is raining but not heavy; dry gauges are not raining", () => {
    const stats = summarizeRain({ data: { stations, readings: [reading("2026-11-20T15:55:00+08:00", 1, 0)] } }, AREAS, NOW);
    expect(stats).toMatchObject({ rainingStations: 1, rainingAreas: ["Jurong West"], heavyAreas: [], maxMm: 1 });
  });

  test("heavy rain holds for 30 minutes, so a storm easing off stays one alert", () => {
    // Heavy in the window ending 15:35 (20 minutes ago), light since.
    const stats = summarizeRain(
      { data: { stations, readings: series([[3, 0], [3, 0], [0, 0], [0, 0], [0, 0], [0.2, 0]]) } },
      AREAS,
      NOW,
    );
    expect(stats).toMatchObject({ maxMm: 0.2, peakMm: 6, heavyAreas: ["Jurong West"] });
  });

  test("heavy rain clears once its wettest 15 minutes leave the hold", () => {
    // The 6 mm reading at 15:10 is in no window ending after 15:25.
    const stats = summarizeRain(
      { data: { stations, readings: series([[6, 0], ...Array.from({ length: 9 }, () => [0, 0] as const)]) } },
      AREAS,
      NOW,
    );
    expect(stats).toMatchObject({ heavyAreas: [], peakMm: 0 });
  });

  test("a stalled or empty feed is unknown, not dry", () => {
    const stalled = [reading("2026-11-20T15:30:00+08:00", 9, 9)];
    expect(summarizeRain({ data: { stations, readings: stalled } }, AREAS, NOW)).toBeNull();
    expect(summarizeRain({ data: { stations: [], readings: [] } }, AREAS, NOW)).toBeNull();
  });
});

describe("storm signals", () => {
  const weather = { psi: 40, psiStatus: "Good" } as WeatherData;

  test("lightning and heavy rain become storm signals after rail", () => {
    const digest = buildSignalDigest({
      trainAlerts: [],
      incidents: [{ id: "i", type: "Accident", lat: 1.3, lng: 103.8, message: "Accident on PIE" }],
      weather,
      weatherAlerts: {
        lightning: { strikes: 3, groundStrikes: 1, areas: ["Bedok", "City"], lastStrikeAt: "x" },
        rain: {
          observedAt: "x",
          stationCount: 80,
          rainingStations: 12,
          maxMm: 3.1,
          peakMm: 7.4,
          rainingAreas: ["Jurong West", "Clementi", "Bukit Batok", "Tuas", "Bedok"],
          heavyAreas: ["Jurong West", "Clementi", "Bukit Batok", "Tuas"],
        },
      },
    });
    expect(digest.map((row) => [row.id, row.tone])).toEqual([
      ["storm:lightning", "danger"],
      ["storm:heavy-rain", "warning"],
      ["road:i", "danger"],
    ]);
    expect(digest[0].text).toBe("Near Bedok, City: 3 strikes (1 to ground) in 30 min");
    expect(digest[1].text).toBe("Jurong West, Clementi, Bukit Batok +1 more: up to 7.4 mm in 15 min");
    expect(signalTitle(digest[0])).toBe("Lightning");
    expect(signalTitle(digest[2])).toBe("Road accident");
  });

  test("calm readings raise no storm signals", () => {
    expect(
      buildSignalDigest({
        trainAlerts: [],
        incidents: [],
        weather,
        weatherAlerts: {
          lightning: { strikes: 0, groundStrikes: 0, areas: [], lastStrikeAt: null },
          rain: { observedAt: "x", stationCount: 80, rainingStations: 3, maxMm: 1.2, peakMm: 1.2, rainingAreas: ["Bedok"], heavyAreas: [] },
        },
      }),
    ).toEqual([]);
  });

  test("cloud-only lightning is a warning", () => {
    const [row] = buildSignalDigest({
      trainAlerts: [],
      incidents: [],
      weather,
      weatherAlerts: { lightning: { strikes: 1, groundStrikes: 0, areas: [], lastStrikeAt: "x" }, rain: null },
    });
    expect(row).toMatchObject({ tone: "warning", text: "Near Singapore: 1 strike in 30 min" });
  });

  test("a failed or stalled part of the feed makes its signal unknown", () => {
    const lightning = { strikes: 0, groundStrikes: 0, areas: [], lastStrikeAt: null };
    expect([...unknownSignalIds({ lightning, rain: null })]).toEqual(["storm:heavy-rain"]);
    expect([...unknownSignalIds({ lightning: null, rain: null })]).toEqual(["storm:lightning", "storm:heavy-rain"]);
    expect(unknownSignalIds(undefined).size).toBe(0);
  });
});

describe("singaporeDate", () => {
  test("uses Singapore's calendar day", () => {
    expect(singaporeDate(Date.parse("2026-11-20T16:30:00Z"))).toBe("2026-11-21");
  });
});
