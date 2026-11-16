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
    expect(SCHOOLS.filter((s) => s.level === "polytechnic")).toHaveLength(5);
    expect(SCHOOLS.filter((s) => s.level === "university").length).toBeGreaterThanOrEqual(6);
  });

  test("rejects malformed bundles", () => {
    expect(validateSchoolsBundle([school()])).toBe(true);
    expect(validateSchoolsBundle({ schools: [school()] })).toBe(false);
    expect(validateSchoolsBundle([{ ...school(), level: "tjc" }])).toBe(false);
    expect(validateSchoolsBundle([{ ...school(), coordsSource: "magic" }])).toBe(false);
  });
});

describe("describeSchool", () => {
  test("names universities and polytechnics by kind, with their own source", () => {
    const nus = school({
      id: "ihl-nationaluniversityofsingapore",
      name: "National University of Singapore",
      level: "university",
      address: "21 Lower Kent Ridge Road, Singapore 119077",
      postalCode: "119077",
      phone: null,
      website: "https://www.nus.edu.sg/",
      mrt: null,
      bus: null,
    });
    expect(texts(describeSchool(nus))).toEqual([
      "National University of Singapore",
      "University",
      "21 Lower Kent Ridge Road, Singapore 119077",
      "Source: curated list of autonomous universities and polytechnics; location via OneMap",
    ]);
    expect(describeSchool({ ...nus, level: "polytechnic" })[1]?.text).toBe("Polytechnic");
  });

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
