import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MALLS } from "@/lib/amenities-data";
import { MALL_STORE_INDEX, mallStoresUrl, validateMallStoreIndex } from "@/lib/mall-stores-data";
import {
  cleanStoreRow,
  compareLevels,
  countCategories,
  filterStores,
  groupStoresByLevel,
  isMallStoreList,
  levelLabel,
  matchStoreListMall,
  normalizeLevel,
  normalizeUnit,
  normalizeWebsite,
} from "@/lib/mall-stores";
import type { Mall, MallStore } from "@/types";

const store = (overrides: Partial<MallStore> = {}): MallStore => ({
  name: "Uniqlo",
  unit: "#01-01",
  level: "L1",
  category: "Fashion & Accessories",
  fnb: false,
  halal: false,
  website: null,
  ...overrides,
});

const mall = (overrides: Partial<Mall> = {}): Mall => ({
  id: "osm-way-1",
  name: "ION Orchard",
  address: "2 Orchard Turn, Singapore 238801",
  lat: 1.304,
  lng: 103.832,
  openingHours: null,
  stores: null,
  fnb: null,
  nearestMrt: null,
  photos: [],
  ...overrides,
});

describe("normalizeUnit", () => {
  test("turns URL slugs into #level-unit form", () => {
    expect(normalizeUnit("unit-b1-k12")).toBe("#B1-K12");
    expect(normalizeUnit("unit-01-62-63")).toBe("#01-62/63");
    expect(normalizeUnit("01-02-to-05")).toBe("#01-02 TO 05");
    expect(normalizeUnit("b1-23")).toBe("#B1-23");
  });

  test("keeps written units and drops blanks", () => {
    expect(normalizeUnit("North Wing, #01-23")).toBe("North Wing, #01-23");
    expect(normalizeUnit("#JP1B1-12")).toBe("#JP1B1-12");
    expect(normalizeUnit("blk-a-outdoor")).toBe("blk-a-outdoor");
    expect(normalizeUnit("  ")).toBeNull();
    expect(normalizeUnit(null)).toBeNull();
  });
});

describe("normalizeLevel", () => {
  test("reads the many upstream level spellings", () => {
    for (const raw of ["01", "L1", "Level 1", "Level 01", "South Wing, Level 1", "01, 02", "BLOCK D 01", "L1 OPEN PLAZA"]) {
      expect(normalizeLevel(raw, null)).toBe("L1");
    }
    for (const raw of ["B1", "Basement 1", "Level B1", "North Wing, Basement 1", "Red Zone, B1 (Carpark)"]) {
      expect(normalizeLevel(raw, null)).toBe("B1");
    }
    expect(normalizeLevel("B2M", null)).toBe("B2M");
  });

  test("falls back to the unit, then to a named area", () => {
    expect(normalizeLevel(null, "#B2-07")).toBe("B2");
    expect(normalizeLevel(null, "#03-15/16")).toBe("L3");
    expect(normalizeLevel(null, "#JP1B1-12")).toBe("B1");
    expect(normalizeLevel(null, "#JP201-12")).toBe("L1");
    expect(normalizeLevel("Tower 3", "Suntec Tower 3")).toBe("Tower 3");
    expect(normalizeLevel("70", null)).toBeNull();
    expect(normalizeLevel(null, null)).toBeNull();
  });
});

describe("normalizeWebsite", () => {
  test("keeps http(s) links and repairs bare domains", () => {
    expect(normalizeWebsite("https://www.uniqlo.com/sg/")).toBe("https://www.uniqlo.com/sg/");
    expect(normalizeWebsite("www.dbs.com.sg")).toBe("https://www.dbs.com.sg/");
  });

  test("drops placeholders and unsafe schemes", () => {
    expect(normalizeWebsite("-")).toBeNull();
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("not a url")).toBeNull();
  });
});

describe("cleanStoreRow", () => {
  test("keeps the fields the panel shows", () => {
    expect(cleanStoreRow({
      store_name: "  4Fingers  Crispy Chicken ",
      unit: "unit-b1-12",
      level: null,
      scope_of_business: null,
      raw_category: null,
      is_fnb: true,
      is_halal: true,
      website: "https://www.4fingers.com.sg/",
    })).toEqual({
      name: "4Fingers Crispy Chicken",
      unit: "#B1-12",
      level: "B1",
      category: "Food & Beverage",
      fnb: true,
      halal: true,
      website: "https://www.4fingers.com.sg/",
    });
    expect(cleanStoreRow({ store_name: "" })).toBeNull();
  });
});

describe("matchStoreListMall", () => {
  const malls = [
    mall({ id: "a", name: "Ang Mo Kio Hub", address: "53 Ang Mo Kio Avenue 3, Singapore 569933" }),
    mall({ id: "b", name: "HillV2 Mall", lat: 1.3634, lng: 103.7644 }),
    mall({ id: "c", name: "Bugis+", lat: 1.2997, lng: 103.8542 }),
    mall({ id: "d", name: "Thomson Plaza", lat: 1.3546, lng: 103.8308 }),
    mall({ id: "e", name: "Jewel Changi Basement", lat: 1.36027, lng: 103.98977 }),
  ];
  const curated = [
    { mall_name: "AMK Hub", postal_code: "569933", latitude: null, longitude: null },
    { mall_name: "Jewel Changi Airport", postal_code: "819666", latitude: "1.360427", longitude: "103.989832" },
  ];

  test("matches by name, curated postcode, position, suffix and alias", () => {
    expect(matchStoreListMall("Bugis+ (Part of Bugis Town)", malls, curated)?.id).toBe("c");
    expect(matchStoreListMall("AMK Hub", malls, curated)?.id).toBe("a");
    expect(matchStoreListMall("Jewel Changi Airport", malls, curated)?.id).toBe("e");
    expect(matchStoreListMall("HillV2", malls, curated)?.id).toBe("b");
    expect(matchStoreListMall("Swing By @ Thomson Plaza", malls, curated, { "Swing By @ Thomson Plaza": "Thomson Plaza" })?.id).toBe("d");
  });

  test("leaves unknown malls unmatched", () => {
    expect(matchStoreListMall("PLQ Mall", malls, curated)).toBeUndefined();
  });
});

describe("directory presentation", () => {
  const stores = [
    store({ name: "Zara", unit: "#02-01", level: "L2" }),
    store({ name: "a.p.c.", unit: "#B1-05", level: "B1" }),
    store({ name: "Kopitiam", unit: "#B2-10", level: "B2", category: "Food & Beverage", fnb: true, halal: true }),
    store({ name: "Kiosk", unit: null, level: null, category: null }),
    store({ name: "Concierge", unit: "#01-K1", level: "Fountain Court", category: "Services" }),
  ];

  test("orders floors from the deepest basement up, named areas and unlisted last", () => {
    expect(groupStoresByLevel(stores).map((group) => group.label)).toEqual([
      "Basement 2", "Basement 1", "Level 2", "Fountain Court", "Level not listed",
    ]);
    expect(["L1", "B2M", "B2", "B1"].sort(compareLevels)).toEqual(["B2", "B2M", "B1", "L1"]);
    expect(levelLabel("B2M")).toBe("Basement 2 Mezzanine");
  });

  test("filters by name, unit, category and halal", () => {
    expect(filterStores(stores, { query: "kopi" }).map((s) => s.name)).toEqual(["Kopitiam"]);
    expect(filterStores(stores, { query: "#b1" }).map((s) => s.name)).toEqual(["a.p.c."]);
    expect(filterStores(stores, { category: "Services" }).map((s) => s.name)).toEqual(["Concierge"]);
    expect(filterStores(stores, { halalOnly: true }).map((s) => s.name)).toEqual(["Kopitiam"]);
    expect(filterStores(stores, {})).toHaveLength(stores.length);
  });

  test("counts categories, most common first", () => {
    expect(countCategories(stores)).toEqual([
      { category: "Fashion & Accessories", count: 2 },
      { category: "Food & Beverage", count: 1 },
      { category: "Services", count: 1 },
    ]);
  });
});

describe("shipped store directories", () => {
  test("the index points at real map malls", () => {
    expect(validateMallStoreIndex(MALL_STORE_INDEX)).toBe(true);
    const mallIds = new Set(MALLS.map((m) => m.id));
    const ids = Object.keys(MALL_STORE_INDEX.malls);
    expect(ids.length).toBeGreaterThan(40);
    for (const id of ids) expect(mallIds.has(id)).toBe(true);
    expect(mallStoresUrl("not-a-mall")).toBeNull();
  });

  test("every list file is valid and matches its index count", () => {
    for (const [id, entry] of Object.entries(MALL_STORE_INDEX.malls)) {
      const list: unknown = JSON.parse(readFileSync(`public/mall-stores/${id}.json`, "utf8"));
      expect(isMallStoreList(list)).toBe(true);
      expect((list as MallStore[]).length).toBe(entry.stores);
    }
  });

  test("rejects malformed lists", () => {
    expect(isMallStoreList([store({ website: "javascript:alert(1)" })])).toBe(false);
    expect(isMallStoreList([{ name: "x" }])).toBe(false);
    expect(isMallStoreList({})).toBe(false);
  });
});
