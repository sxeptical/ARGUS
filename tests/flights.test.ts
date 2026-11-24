import { describe, expect, test } from "bun:test";
import {
  adsbGlobeUrl,
  airlineFromCallsign,
  describeAircraftCategory,
  describeSquawk,
  formatDistanceFromChangi,
  formatFlightAltitude,
  formatFlightSpeed,
  formatFlightTrack,
  formatVerticalRate,
} from "@/lib/flights";

describe("flight detail formatters", () => {
  test("infers airline names from ICAO callsign prefixes", () => {
    expect(airlineFromCallsign("SIA321")).toBe("Singapore Airlines");
    expect(airlineFromCallsign("tgw123")).toBe("Scoot");
    expect(airlineFromCallsign("MAS870")).toBe("Malaysia Airlines");
    expect(airlineFromCallsign("9V-SMU")).toBeNull();
    expect(airlineFromCallsign("ZZZ999")).toBeNull();
  });

  test("formats altitude with flight level at or above 18,000 ft", () => {
    expect(formatFlightAltitude(10_972.8)).toBe("36,000 ft (FL360)");
    expect(formatFlightAltitude(1_524)).toBe("5,000 ft");
    expect(formatFlightAltitude(null)).toBe("N/A");
  });

  test("formats ground speed in km/h, knots, and optional Mach", () => {
    expect(formatFlightSpeed(234, 0.79)).toBe("842 km/h · 455 kt · M0.79");
    expect(formatFlightSpeed(150, null)).toBe("540 km/h · 292 kt");
    expect(formatFlightSpeed(null)).toBe("N/A");
  });

  test("formats vertical rate with climb/descent/level trend", () => {
    expect(formatVerticalRate(7.5)).toContain("Climbing");
    expect(formatVerticalRate(-5)).toContain("Descending");
    expect(formatVerticalRate(0.1)).toBe("Level");
    expect(formatVerticalRate(null)).toBe("N/A");
  });

  test("formats track with 16-point compass heading", () => {
    expect(formatFlightTrack(295.4)).toBe("295° WNW");
    expect(formatFlightTrack(0)).toBe("0° N");
    expect(formatFlightTrack(null)).toBe("N/A");
  });

  test("formats distance and bearing relative to Changi", () => {
    expect(formatDistanceFromChangi(1.3644, 103.9915)).toBe("<1 km from Changi");
    expect(formatDistanceFromChangi(1.17, 103.96)).toMatch(/^\d+ km S/);
  });

  test("maps ADS-B emitter categories, squawks, and globe URL", () => {
    expect(describeAircraftCategory("A3")).toBe("Large");
    expect(describeAircraftCategory("A5")).toBe("Heavy");
    expect(describeSquawk("7700")).toBe("7700 (General emergency)");
    expect(describeSquawk("7010")).toBe("7010");
    expect(adsbGlobeUrl("76CE81")).toBe("https://globe.adsb.lol/?icao=76ce81");
  });
});
