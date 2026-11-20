import { describe, expect, test } from "bun:test";
import { AMENITY_LAYER_BY_TYPE, AMENITY_SEARCH_RESULTS, type AmenityPlace } from "@/lib/amenity-layers";
import type { SensorKey } from "@/lib/layers";
import {
  browseSearchResults,
  countSearchTypes,
  isSearchResultShown,
  matchSearchResults,
  searchResultLayer,
} from "@/lib/map-search";
import type { MapSearchResult, SearchResultType } from "@/types";

const result = (name: string, type: SearchResultType = "mall", keywords: string[] = []): MapSearchResult => ({
  id: `${type}:${name}`,
  type,
  name,
  lat: 1.3,
  lng: 103.8,
  zoom: 16,
  keywords,
});

describe("matchSearchResults", () => {
  test("matches names and keywords case-insensitively, keeping the given order", () => {
    const results = [result("Bishan", "mrt", ["mrt", "Circle Line"]), result("Circle Point"), result("Tampines")];
    expect(matchSearchResults(results, " CIRCLE ").map(({ result }) => result.name)).toEqual(["Bishan", "Circle Point"]);
  });

  test("marks where the query sits in the name for highlighting", () => {
    const [bishan, point] = matchSearchResults([result("Bishan", "mrt", ["Circle Line"]), result("Circle Point")], "circle");
    expect(bishan.nameMatch).toBeNull();
    expect(point.nameMatch).toEqual({ start: 0, end: 6 });
  });

  test("returns nothing for a blank query", () => {
    expect(matchSearchResults([result("Bishan")], "  ")).toEqual([]);
  });
});

describe("countSearchTypes", () => {
  test("counts per type in pill order", () => {
    const matches = [result("A", "park"), result("B", "mrt"), result("C", "park")].map((r) => ({ result: r }));
    expect(countSearchTypes(matches)).toEqual([{ type: "mrt", count: 1 }, { type: "park", count: 2 }]);
  });
});

describe("browseSearchResults", () => {
  test("lists everything A–Z across categories", () => {
    const results = [result("Zoo Park", "park"), result("Bishan", "mrt"), result("Aida Park", "park"), result("Admiralty", "mrt")];
    expect(browseSearchResults(results, null).map((r) => r.name)).toEqual(["Admiralty", "Aida Park", "Bishan", "Zoo Park"]);
    expect(browseSearchResults(results, "park").map((r) => r.name)).toEqual(["Aida Park", "Zoo Park"]);
  });
});

describe("searchResultLayer", () => {
  test("maps each result type to the layer that draws it", () => {
    expect(searchResultLayer("mrt")).toBe("mrt");
    expect(searchResultLayer("bus-stop")).toBe("busStops");
    expect(searchResultLayer("park")).toBe("parks");
    expect(searchResultLayer("mall")).toBe("malls");
    expect(searchResultLayer("community-club")).toBe("communityClubs");
  });
});

describe("isSearchResultShown", () => {
  const visibility = (on: boolean) => new Proxy({}, { get: () => on }) as Record<SensorKey, boolean>;
  const gym = AMENITY_SEARCH_RESULTS.find((r) => r.type === "gym")!;
  const brand = AMENITY_LAYER_BY_TYPE.get("gym")!.byId.get(gym.id)! as AmenityPlace & { brand: string };

  test("hides results whose layer is off", () => {
    expect(isSearchResultShown(gym, visibility(true), {})).toBe(true);
    expect(isSearchResultShown(gym, visibility(false), {})).toBe(false);
  });

  test("hides amenities whose sub-filter option is unchecked", () => {
    expect(isSearchResultShown(gym, visibility(true), { gym: { [brand.brand]: false } })).toBe(false);
    expect(isSearchResultShown(gym, visibility(true), { gym: { [brand.brand]: true } })).toBe(true);
  });
});
