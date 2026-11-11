import { describe, expect, test } from "bun:test";
import { formatCoordinates, googleMapsUrl } from "@/lib/maps-links";

const BASE = "https://www.google.com/maps/search/?api=1&query=";

describe("googleMapsUrl", () => {
  test("prefers the name plus the street address", () => {
    expect(
      googleMapsUrl({
        name: "Tampines ActiveSG Gym",
        address: "1 Tampines Walk, Singapore 528523",
        lat: 1.3531,
        lng: 103.9404,
      }),
    ).toBe(
      `${BASE}Tampines%20ActiveSG%20Gym%2C%201%20Tampines%20Walk%2C%20Singapore%20528523`,
    );
  });

  test("encodes names and addresses safely", () => {
    expect(
      googleMapsUrl({
        name: "Ya Kun Kaya Toast @ Marina Bay Link Mall",
        address: "8A Marina Boulevard #B2-52, Singapore 018984",
      }),
    ).toBe(
      `${BASE}Ya%20Kun%20Kaya%20Toast%20%40%20Marina%20Bay%20Link%20Mall%2C%208A%20Marina%20Boulevard%20%23B2-52%2C%20Singapore%20018984`,
    );
  });

  test("keeps bare-postcode hotel addresses because they identify one building", () => {
    expect(
      googleMapsUrl({
        name: "21 Carpenter",
        address: "Singapore 059984",
        lat: 1.2861,
        lng: 103.8482,
      }),
    ).toBe(`${BASE}21%20Carpenter%2C%20Singapore%20059984`);
  });

  test("falls back to coordinates when there is no usable address", () => {
    expect(
      googleMapsUrl({
        name: "24/7 Fitness",
        address: null,
        lat: 1.36134,
        lng: 103.84155,
      }),
    ).toBe(`${BASE}1.36134%2C103.84155`);
  });

  test("trims whitespace and ignores an empty address", () => {
    expect(
      googleMapsUrl({
        name: "   Anchorvale Village Hawker Centre ",
        address: "   ",
        lat: 1.39201,
        lng: 103.88791,
      }),
    ).toBe(`${BASE}1.39201%2C103.88791`);
  });

  test("uses only the address when the name is missing", () => {
    expect(
      googleMapsUrl({
        address: "1 Raffles Place, Singapore 048616",
        lat: 1.2841,
        lng: 103.8512,
      }),
    ).toBe(`${BASE}1%20Raffles%20Place%2C%20Singapore%20048616`);
  });

  test("falls back to name and region without coordinates", () => {
    expect(
      googleMapsUrl({
        name: "Adam Park",
        address: null,
        lat: null,
        lng: null,
      }),
    ).toBe(`${BASE}Adam%20Park%2C%20Singapore`);
  });

  test("rejects invalid coordinates rather than linking to 0,0", () => {
    expect(
      googleMapsUrl({
        name: null,
        address: null,
        lat: Number.NaN,
        lng: 103.8,
      }),
    ).toBeNull();
    expect(
      googleMapsUrl({
        name: null,
        address: null,
        lat: 91,
        lng: 103.8,
      }),
    ).toBeNull();
  });

  test("returns null with nothing to search", () => {
    expect(googleMapsUrl({})).toBeNull();
    expect(googleMapsUrl({ name: "   ", address: "" })).toBeNull();
  });
});

describe("formatCoordinates", () => {
  test("rounds to six decimals and drops trailing zeroes", () => {
    expect(formatCoordinates(1.3500004, 103.9400001)).toBe("1.35,103.94");
    expect(formatCoordinates(1.23456789, 103.98765432)).toBe(
      "1.234568,103.987654",
    );
  });

  test("rejects missing or out-of-range values", () => {
    expect(formatCoordinates(null, 103.8)).toBeNull();
    expect(formatCoordinates(1.35, undefined)).toBeNull();
    expect(formatCoordinates(Number.POSITIVE_INFINITY, 103.8)).toBeNull();
    expect(formatCoordinates(-91, 103.8)).toBeNull();
    expect(formatCoordinates(1.35, 181)).toBeNull();
  });
});
