import { describe, expect, test } from "bun:test";
import { SCHOOLS, validateSchoolsBundle } from "@/lib/data/schools";
import { describeSchool } from "@/lib/schools";
import type { School } from "@/types";

const school = (overrides: Partial<School> = {}): School => ({
  id: "moe-admiraltyprimaryschool",
  name: "ADMIRALTY PRIMARY SCHOOL",
  level: "primary",
  address: "11 WOODLANDS CIRCLE, Singapore 738907",
  postalCode: "738907",
  phone: "+65 6362 0598",
  website: "https://admiraltypri.moe.edu.sg/",
  mrt: "Admiralty Station",
  bus: "965, 964, 913",
  lat: 1.442635,
  lng: 103.80004,
  coordsSource: "onemap",
  ...overrides,
});

const texts = (lines: ReadonlyArray<{ text: string }>) => lines.map((line) => line.text);

describe("schools bundle", () => {
  test("ships every school level", () => {
    expect(SCHOOLS.some((s) => s.level === "primary")).toBe(true);
    expect(SCHOOLS.some((s) => s.level === "secondary")).toBe(true);
    expect(SCHOOLS.some((s) => s.level === "jc")).toBe(true);
    expect(SCHOOLS.some((s) => s.level === "mixed")).toBe(true);
  });

  test("rejects malformed bundles", () => {
    expect(validateSchoolsBundle([school()])).toBe(true);
    expect(validateSchoolsBundle({ schools: [school()] })).toBe(false);
    expect(validateSchoolsBundle([{ ...school(), level: "tjc" }])).toBe(false);
    expect(validateSchoolsBundle([{ ...school(), coordsSource: "magic" }])).toBe(false);
  });
});

describe("describeSchool", () => {
  test("shows the level, address, phone, MRT and bus", () => {
    expect(texts(describeSchool(school()))).toEqual([
      "ADMIRALTY PRIMARY SCHOOL",
      "Primary school",
      "11 WOODLANDS CIRCLE, Singapore 738907",
      "Tel +65 6362 0598",
      "MRT: Admiralty Station",
      "Bus: 965, 964, 913",
      "Source: Ministry of Education via data.gov.sg (Singapore Open Data Licence)",
    ]);
  });
});
