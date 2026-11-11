import { describe, expect, test } from "bun:test";
import {
  AMENITY_LAYER_BY_TYPE,
  AMENITY_LAYERS,
  AMENITY_SEARCH_RESULTS,
  findAmenity,
  parseAmenityFilters,
  visiblePlaces,
} from "@/lib/amenity-layers";
import { GYMS } from "@/lib/data/gyms";
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
