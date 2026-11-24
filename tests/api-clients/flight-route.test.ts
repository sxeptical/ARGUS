import { describe, expect, test } from "bun:test";
import { getFlightRoute } from "@/lib/api-clients/flight-route";
import { withFetch } from "../helpers/upstream";

describe("getFlightRoute", () => {
  test("resolves origin and destination from adsbdb.com", async () => {
    const result = await withFetch(
      async (input) => {
        expect(String(input)).toContain("api.adsbdb.com/v0/callsign/SIA321");
        return Response.json({
          response: {
            flightroute: {
              callsign: "SIA321",
              callsign_iata: "SQ321",
              airline: { name: "Singapore Airlines", iata: "SQ", icao: "SIA" },
              origin: {
                iata_code: "LHR",
                icao_code: "EGLL",
                name: "London Heathrow Airport",
                municipality: "London",
                country_name: "United Kingdom",
              },
              destination: {
                iata_code: "SIN",
                icao_code: "WSSS",
                name: "Singapore Changi Airport",
                municipality: "Singapore",
                country_name: "Singapore",
              },
            },
          },
        });
      },
      () => getFlightRoute("sia321"),
    );

    expect(result).toEqual({
      callsign: "SIA321",
      iataFlight: "SQ321",
      airline: "Singapore Airlines",
      origin: {
        iata: "LHR",
        icao: "EGLL",
        name: "London Heathrow Airport",
        city: "London",
        country: "United Kingdom",
      },
      destination: {
        iata: "SIN",
        icao: "WSSS",
        name: "Singapore Changi Airport",
        city: "Singapore",
        country: "Singapore",
      },
    });
  });

  test("falls back to hexdb.io when adsbdb returns 404", async () => {
    const result = await withFetch(
      async (input) => {
        const url = String(input);
        if (url.includes("api.adsbdb.com")) {
          return new Response(JSON.stringify({ response: "unknown callsign" }), {
            status: 404,
          });
        }
        expect(url).toContain("hexdb.io/api/v1/route/iata/TGW123");
        return Response.json({ flight: "TGW123", route: "SIN-BKK" });
      },
      () => getFlightRoute("TGW123"),
    );

    expect(result?.origin?.iata).toBe("SIN");
    expect(result?.destination?.iata).toBe("BKK");
  });

  test("returns null when neither provider knows the callsign", async () => {
    const result = await withFetch(
      async () => new Response("not found", { status: 404 }),
      () => getFlightRoute("PRIVATE1"),
    );

    expect(result).toBeNull();
  });
});
