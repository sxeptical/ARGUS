import { describe, expect, test } from "bun:test";
import {
  AMENITY_COLLISION_RADIUS_M,
  AMENITY_COINCIDENCE_THRESHOLD_M,
  AMENITY_DISPLAY_COORDS,
  AMENITY_LAYER_BY_TYPE,
  AMENITY_LAYERS,
  AMENITY_SEARCH_RESULTS,
  amenityDisplayKey,
  amenityDisplayPoint,
  computeAmenityOffsets,
  findAmenity,
  parseAmenityFilters,
  visiblePlaces,
} from "@/lib/amenity-layers";
import { GYMS } from "@/lib/data/gyms";
import { PHARMACIES } from "@/lib/data/pharmacies";
import { HEALTHCARE_SITES } from "@/lib/data/healthcare";
import { HOTELS } from "@/lib/data/hotels";
import { LAYER_BY_KEY } from "@/lib/layers";
import { LIBRARIES } from "@/lib/data/libraries";
import type { AmenityType } from "@/types";

const amenity = (type: AmenityType) => AMENITY_LAYER_BY_TYPE.get(type)!;
const choiceValues = (type: AmenityType) => amenity(type).filter!.choices.map((choice) => choice.value);

describe("amenity registry", () => {
  test("every amenity has its own layer in the Amenities group", () => {
    const layers = AMENITY_LAYERS.map((entry) => entry.layer);
    expect(new Set(layers).size).toBe(layers.length);
    for (const layer of layers) expect(LAYER_BY_KEY.get(layer)?.group).toBe("amenities");
  });

  test("ids are unique within an amenity, so selection by id is unambiguous", () => {
    for (const entry of AMENITY_LAYERS) expect(entry.byId.size).toBe(entry.places.length);
  });

  test("healthcare, the densest layer, is drawn last and from city zoom", () => {
    expect(AMENITY_LAYERS.at(-1)?.type).toBe("healthcare");
    expect(amenity("healthcare").minZoom).toEqual({ points: 11, labels: 15 });
  });

  test("only planned hawker centres are muted", () => {
    const hawkers = amenity("hawker");
    const muted = hawkers.places.filter((place) => hawkers.muted?.(place));
    expect(muted.length).toBeGreaterThan(0);
    expect(muted.length).toBeLessThan(hawkers.places.length);
    expect(amenity("mall").muted).toBeUndefined();
  });
});

describe("sub-filters", () => {
  test("only gyms, heritage, supermarkets, schools and healthcare have one", () => {
    expect(AMENITY_LAYERS.filter((entry) => entry.filter).map((entry) => entry.type)).toEqual([
      "gym",
      "heritage",
      "supermarket",
      "school",
      "healthcare",
    ]);
  });

  test("choices count every place exactly once", () => {
    for (const entry of AMENITY_LAYERS) {
      if (!entry.filter) continue;
      const total = entry.filter.choices.reduce((sum, choice) => sum + choice.count, 0);
      expect(total).toBe(entry.places.length);
    }
  });

  test("gym brands: ActiveSG first, then biggest first", () => {
    const [first, ...rest] = amenity("gym").filter!.choices;
    expect(first.value).toBe("ActiveSG");
    expect(rest.map((choice) => choice.count)).toEqual(rest.map((choice) => choice.count).sort((a, b) => b - a));
  });

  test("supermarket brands: biggest first with Other last", () => {
    const choices = amenity("supermarket").filter!.choices;
    expect(choices[0].value).toBe("NTUC FairPrice");
    expect(choices.at(-1)?.value).toBe("Other");
    const branded = choices.slice(0, -1).map((choice) => choice.count);
    expect(branded).toEqual([...branded].sort((a, b) => b - a));
  });

  test("kinds and levels keep their declared order, with readable labels", () => {
    expect(choiceValues("heritage")).toEqual(["historic-site", "monument", "museum"]);
    expect(choiceValues("healthcare")).toEqual(["gp", "hospital", "dental"]);
    expect(choiceValues("school")).toEqual(["primary", "secondary", "jc", "mixed"]);
    expect(amenity("healthcare").filter!.choices[0].label).toBe("GP clinic");
    expect(amenity("gym").filter!.choices[0].label).toBe("ActiveSG");
  });

  test("visiblePlaces keeps places whose option is on; absent options read as on", () => {
    const schools = amenity("school");
    expect(visiblePlaces(schools, {})).toBe(schools.places);
    expect(visiblePlaces(schools, { school: {} })).toHaveLength(schools.places.length);
    const primaryOnly = visiblePlaces(schools, { school: { primary: true, secondary: false, jc: false, mixed: false } });
    expect(primaryOnly).toHaveLength(schools.filter!.choices.find((choice) => choice.value === "primary")!.count);
    // A selection for another amenity, or for one without a filter, changes nothing.
    expect(visiblePlaces(schools, { gym: { ActiveSG: false } })).toBe(schools.places);
    expect(visiblePlaces(amenity("mall"), { mall: { anything: false } })).toBe(amenity("mall").places);
  });

  test("parseAmenityFilters keeps known options and never strands a layer empty", () => {
    expect(parseAmenityFilters(null)).toBeUndefined();
    expect(parseAmenityFilters([])).toBeUndefined();
    const parsed = parseAmenityFilters({
      school: { primary: false, bogus: false },
      healthcare: { gp: false, hospital: false, dental: false },
      mall: { anything: false },
      gym: "junk",
    })!;
    expect(parsed.school).toEqual({ primary: false, secondary: true, jc: true, mixed: true });
    expect(parsed.healthcare).toEqual({ gp: true, hospital: true, dental: true });
    expect(parsed.mall).toBeUndefined();
    expect(parsed.gym).toBeUndefined();
  });

  test("a selection that only enables options with no places falls back to all-on", () => {
    const gym = amenity("gym");
    const filter = gym.filter!;
    const options = filter.options;
    // Simulate a brand the current bundle no longer carries: it stays a
    // declared option but has no chip, so the stored selection turns every
    // visible choice off.
    const mutable = filter as { options: ReadonlyArray<string> };
    mutable.options = [...options, "Closed Chain"];
    try {
      const parsed = parseAmenityFilters({
        gym: {
          "Closed Chain": true,
          ...Object.fromEntries(filter.choices.map((choice) => [choice.value, false])),
        },
      })!;
      expect(Object.values(parsed.gym!).every(Boolean)).toBe(true);
      expect(visiblePlaces(gym, parsed)).toHaveLength(gym.places.length);
    } finally {
      mutable.options = options;
    }
  });
});

describe("co-located amenity markers", () => {
  const metresBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
    const dLat = ((b.lat - a.lat) * Math.PI) / 180 * 6_371_000;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180 * 6_371_000 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    return Math.hypot(dLat, dLng);
  };
  const point = (id: string, lat: number, lng: number) => ({ id, lat, lng });
  const layer = (type: string, places: ReturnType<typeof point>[]) => [{ type, places }];

  test("points within the threshold are grouped, farther ones are untouched", () => {
    const near = computeAmenityOffsets(layer("mall", [point("a", 1.3, 103.8), point("b", 1.3 + 5 / 111_320, 103.8)]));
    expect(near.size).toBe(2);
    expect(near.has(amenityDisplayKey("mall", "a"))).toBe(true);
    expect(near.has(amenityDisplayKey("mall", "b"))).toBe(true);

    const far = computeAmenityOffsets(layer("mall", [point("a", 1.3, 103.8), point("b", 1.3 + 20 / 111_320, 103.8)]));
    expect(far.size).toBe(0);
  });

  test("grouping is deterministic and independent of source order", () => {
    const places = [point("b", 1.3, 103.8), point("a", 1.3 + 4 / 111_320, 103.8), point("c", 1.3, 103.8 + 4 / 111_320)];
    const forward = computeAmenityOffsets(layer("gym", places));
    const reversed = computeAmenityOffsets(layer("gym", [...places].reverse()));
    expect([...forward]).toEqual([...reversed]);
    expect([...forward.keys()]).toEqual([
      amenityDisplayKey("gym", "a"),
      amenityDisplayKey("gym", "b"),
      amenityDisplayKey("gym", "c"),
    ]);
  });

  test("adding another, far-away layer does not move a collision group", () => {
    const colliding = [
      { type: "gym", places: [point("z", 1.3, 103.8)] },
      { type: "pharmacy", places: [point("y", 1.3, 103.8)] },
    ];
    const base = computeAmenityOffsets(colliding);
    const withExtra = computeAmenityOffsets([...colliding, { type: "hotel", places: [point("h", 1.4, 103.9)] }]);
    expect(withExtra.get(amenityDisplayKey("gym", "z"))).toEqual(base.get(amenityDisplayKey("gym", "z")));
    expect(withExtra.get(amenityDisplayKey("pharmacy", "y"))).toEqual(base.get(amenityDisplayKey("pharmacy", "y")));
    expect(withExtra.has(amenityDisplayKey("hotel", "h"))).toBe(false);
  });

  test("every offset is small and every place keeps its true coordinates", () => {
    expect(AMENITY_DISPLAY_COORDS.size).toBeGreaterThan(0);
    for (const [key, display] of AMENITY_DISPLAY_COORDS) {
      const separator = key.indexOf(":");
      const type = key.slice(0, separator) as AmenityType;
      const place = amenity(type).byId.get(key.slice(separator + 1))!;
      expect(metresBetween(place, display)).toBeLessThanOrEqual(AMENITY_COLLISION_RADIUS_M + 1);
      expect(amenityDisplayPoint(type, place)).toBe(display);
      expect([place.lat, place.lng]).not.toEqual([display.lat, display.lng]);
    }
    const lonely = amenity("gym").places.find((place) => !AMENITY_DISPLAY_COORDS.has(amenityDisplayKey("gym", place.id)))!;
    expect(amenityDisplayPoint("gym", lonely)).toBe(lonely);
    expect(AMENITY_COINCIDENCE_THRESHOLD_M).toBe(10);
  });

  test("Tampines ActiveSG Gym and the OTH Guardian pharmacy get distinct display points", () => {
    const gym = GYMS.find((place) => place.id === "sportsg-tampinessportcentre")!;
    const pharmacy = PHARMACIES.find((place) => place.id === "pharmacy-2617")!;
    expect([gym.lat, gym.lng]).toEqual([pharmacy.lat, pharmacy.lng]);
    const gymPoint = amenityDisplayPoint("gym", gym);
    const pharmacyPoint = amenityDisplayPoint("pharmacy", pharmacy);
    expect(gymPoint).not.toEqual(pharmacyPoint);
    expect(metresBetween(gymPoint, pharmacyPoint)).toBeGreaterThan(AMENITY_COLLISION_RADIUS_M);
    expect(metresBetween(gym, gymPoint)).toBeLessThanOrEqual(AMENITY_COLLISION_RADIUS_M);
    expect(metresBetween(pharmacy, pharmacyPoint)).toBeLessThanOrEqual(AMENITY_COLLISION_RADIUS_M);
    // Search still points at the true location.
    const result = AMENITY_SEARCH_RESULTS.find((candidate) => candidate.type === "gym" && candidate.id === gym.id)!;
    expect(result).toMatchObject({ lat: gym.lat, lng: gym.lng });
    expect(findAmenity("gym", gym.id)).toEqual({ type: "gym", place: gym } as never);
  });

  test("Heartbeat @ Bedok ActiveSG Gym also separates from its co-located pharmacy", () => {
    const gym = GYMS.find((place) => place.id === "sportsg-heartbeatbedokactivesgsportcentre")!;
    const pharmacy = PHARMACIES.find((place) => place.id === "pharmacy-2647")!;
    expect([gym.lat, gym.lng]).toEqual([pharmacy.lat, pharmacy.lng]);
    expect(amenityDisplayPoint("gym", gym)).not.toEqual(amenityDisplayPoint("pharmacy", pharmacy));
  });
});

describe("amenity search and selection", () => {
  test("every place is searchable under its type, at street zoom", () => {
    expect(AMENITY_SEARCH_RESULTS).toHaveLength(AMENITY_LAYERS.reduce((sum, entry) => sum + entry.places.length, 0));
    expect(AMENITY_SEARCH_RESULTS.every((result) => result.zoom === 16)).toBe(true);
  });

  test("each type carries its search terms and the address", () => {
    const terms: Record<AmenityType, string[]> = {
      mall: ["mall", "shopping"],
      hawker: ["hawker", "food centre"],
      gym: ["gym", "fitness"],
      "community-club": ["community club", "PA"],
      pharmacy: ["pharmacy", "chemist"],
      hotel: ["hotel", "stay"],
      heritage: ["heritage"],
      healthcare: ["healthcare", "clinic"],
      library: ["library", "NLB"],
      supermarket: ["supermarket", "grocery"],
      school: ["school"],
    };
    for (const [type, expected] of Object.entries(terms) as Array<[AmenityType, string[]]>) {
      const place = amenity(type).places.find((candidate) => candidate.address)!;
      const result = AMENITY_SEARCH_RESULTS.find((candidate) => candidate.type === type && candidate.id === place.id)!;
      expect(result).toMatchObject({ name: place.name, lat: place.lat, lng: place.lng });
      for (const term of [...expected, place.address!]) expect(result.keywords).toContain(term);
    }
  });

  test("type-specific terms: brand, category, kind label, room count, branch code", () => {
    const keywordsOf = (type: AmenityType, id: string) =>
      AMENITY_SEARCH_RESULTS.find((result) => result.type === type && result.id === id)!.keywords;
    const gym = GYMS[0];
    expect(keywordsOf("gym", gym.id)).toContain(gym.brand);
    const hotel = HOTELS.find((place) => place.rooms !== null)!;
    expect(keywordsOf("hotel", hotel.id)).toContain(String(hotel.rooms));
    const library = LIBRARIES.find((place) => place.branch !== null)!;
    expect(keywordsOf("library", library.id)).toContain(library.branch!);
    const hospital = HEALTHCARE_SITES.find((place) => place.kind === "hospital")!;
    expect(keywordsOf("healthcare", hospital.id)).toContain("Hospital");
  });

  test("findAmenity resolves a selection to its record, or null", () => {
    const mall = amenity("mall").places[0];
    expect(findAmenity("mall", mall.id)).toEqual({ type: "mall", place: mall } as never);
    expect(findAmenity("gym", mall.id)).toBeNull();
    expect(findAmenity("mall", "nope")).toBeNull();
  });
});
