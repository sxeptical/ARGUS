import { describe, expect, test } from "bun:test";
import { hasTokenSeq, phoneOf, tokens, websiteOf } from "../scripts/lib/place-fields.mjs";

describe("websiteOf", () => {
  test("keeps URLs and prefixes a missing scheme", () => {
    expect(websiteOf("https://www.example.com")).toBe("https://www.example.com");
    expect(websiteOf("http://example.com.sg/shop?q=1")).toBe("http://example.com.sg/shop?q=1");
    expect(websiteOf("www.example.com")).toBe("https://www.example.com");
    expect(websiteOf("  example.com/path  ")).toBe("https://example.com/path");
  });

  test("returns null for empty or non-URL values", () => {
    for (const value of [null, undefined, "", "   ", "n/a", "see our website", "https://", "www.example com", "https://example.com/a b"]) {
      expect(websiteOf(value)).toBeNull();
    }
  });
});

describe("phoneOf", () => {
  test("formats Singapore landline numbers", () => {
    expect(phoneOf("68615755")).toBe("+65 6861 5755");
    expect(phoneOf("6568615755")).toBe("+65 6861 5755");
    expect(phoneOf("+65 6861 5755")).toBe("+65 6861 5755");
  });

  test("keeps other formats as tagged and drops empty values", () => {
    expect(phoneOf("1800 123 4567")).toBe("1800 123 4567");
    expect(phoneOf("6861 5755 ext 12")).toBe("6861 5755 ext 12");
    for (const value of [null, undefined, "", "na"]) expect(phoneOf(value)).toBeNull();
  });
});

describe("tokens and hasTokenSeq", () => {
  test("splits into lower-case whole tokens", () => {
    expect(tokens("Ang Mo Supermarket")).toEqual(["ang", "mo", "supermarket"]);
    expect(tokens("CS Fresh @ 123")).toEqual(["cs", "fresh", "123"]);
    expect(tokens(undefined)).toEqual([]);
    expect(tokens("")).toEqual([]);
  });

  test("matches only contiguous, ordered, whole-token sequences", () => {
    const haystack = tokens("Ang Mo Supermarket");
    expect(hasTokenSeq(haystack, ["ang", "mo"])).toBe(true);
    expect(hasTokenSeq(haystack, ["mo", "ang"])).toBe(false);
    expect(hasTokenSeq(haystack, ["ang", "supermarket"])).toBe(false);
    expect(hasTokenSeq(haystack, ["ang", "mo", "kio"])).toBe(false);
    expect(hasTokenSeq(tokens("Prime Supermarket"), ["prim"])).toBe(false);
    expect(hasTokenSeq(haystack, [])).toBe(false);
    expect(hasTokenSeq(tokens("Giant"), ["giant", "express"])).toBe(false);
  });
});
