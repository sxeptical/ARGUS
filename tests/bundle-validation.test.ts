import { describe, expect, test } from "bun:test";
import {
  isAddressedPlace,
  isNullableHttpUrl,
  isOneOf,
  isPhotoList,
  isPlace,
} from "@/lib/bundle-validation";
import type { PlacePhoto } from "@/types";

const place = { id: "p-1", name: "Somewhere", lat: 1.3, lng: 103.8 };
const commonsPhoto: PlacePhoto = {
  thumb: "https://thumb.wikimedia.org/a.jpg",
  page: "https://commons.wikimedia.org/wiki/File:A.jpg",
  author: "Terence Ong",
  license: "CC BY 2.5",
  source: "commons",
};
const neaPhoto: PlacePhoto = { thumb: "https://www.nea.gov.sg/images/a.jpg", page: null, author: "NEA", license: null, source: "nea" };

describe("isPlace", () => {
  test("requires a non-empty id and name and a finite position", () => {
    expect(isPlace(place)).toBe(true);
    expect(isPlace({ ...place, id: "" })).toBe(false);
    expect(isPlace({ ...place, name: "" })).toBe(false);
    expect(isPlace({ ...place, lat: Number.NaN })).toBe(false);
    expect(isPlace(null)).toBe(false);
    expect(isPlace("not a place")).toBe(false);
  });
});

describe("isAddressedPlace", () => {
  test("accepts a nullable string address and rejects other types", () => {
    expect(isAddressedPlace({ ...place, address: "1 Example Road" })).toBe(true);
    expect(isAddressedPlace({ ...place, address: null })).toBe(true);
    expect(isAddressedPlace({ ...place, address: 42 })).toBe(false);
  });
});

describe("isNullableHttpUrl", () => {
  test("accepts null and http(s) URLs only", () => {
    expect(isNullableHttpUrl(null)).toBe(true);
    expect(isNullableHttpUrl("http://example.com")).toBe(true);
    expect(isNullableHttpUrl("https://example.com/a")).toBe(true);
    expect(isNullableHttpUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("isOneOf", () => {
  test("checks membership against the allowed strings", () => {
    expect(isOneOf(["a", "b"], "b")).toBe(true);
    expect(isOneOf(["a", "b"], "c")).toBe(false);
    expect(isOneOf(["a"], 1)).toBe(false);
  });
});

describe("isPhotoList", () => {
  test("accepts credited Commons and NEA photos", () => {
    expect(isPhotoList([commonsPhoto, neaPhoto])).toBe(true);
    expect(isPhotoList([])).toBe(true);
  });

  test("rejects photos from disallowed hosts or without a licence", () => {
    expect(isPhotoList([{ ...commonsPhoto, thumb: "https://evil.example/a.jpg" }])).toBe(false);
    expect(isPhotoList([{ ...commonsPhoto, license: null }])).toBe(false);
    expect(isPhotoList([{ ...commonsPhoto, page: "javascript:alert(1)" }])).toBe(false);
    expect(isPhotoList([{ ...commonsPhoto, page: "https://evil.example/a" }])).toBe(false);
    expect(isPhotoList([{ ...neaPhoto, thumb: "https://www.nea.gov.sg.evil.example/a.jpg" }])).toBe(false);
  });
});
