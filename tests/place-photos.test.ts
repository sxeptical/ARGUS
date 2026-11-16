import { describe, expect, test } from "bun:test";
import { nameOverlap, namesMatch, nameVariants } from "../scripts/lib/place-photos.mjs";

describe("nameVariants", () => {
  test("splits out the buildings a heritage name bundles", () => {
    expect(nameVariants("Former Tao Nan School (now The Peranakan Museum)")).toContain("The Peranakan Museum");
    expect(nameVariants("Former Telok Ayer Market (now known as Lau Pa Sat)")).toContain("Lau Pa Sat");
    const bridges = nameVariants("Singapore River Bridges: Cavenagh Bridge, Anderson Bridge and Elgin Bridge");
    expect(bridges).toEqual(expect.arrayContaining(["Cavenagh Bridge", "Anderson Bridge", "Elgin Bridge"]));
  });
});

describe("namesMatch", () => {
  test("matches heritage names that drift from Wikidata's", () => {
    for (const [a, b] of [
      ["Abdul Gafoor Mosque", "Masjid Abdul Gaffoor"],
      ["Sultan Mosque", "Masjid Sultan"],
      ["St. George's Church", "Saint George's Church"],
      ["Former Parliament House and Annex Building (now The Arts House)", "The Arts House"],
      ["Former Siong Lim Temple (now Lian Shan Shuang Lin Monastery)", "Siong Lim Temple"],
      ["The Istana and Sri Temasek", "The Istana"],
      ["Omar Kampong Malacca Mosque", "Masjid Omar Kampong Melaka"],
    ]) {
      expect(namesMatch(a, b)).toBe(true);
    }
  });

  test("rejects names that share only part of the longer name", () => {
    for (const [a, b] of [
      ["Former Keng Teck Whay Building", "Thian Hock Keng"],
      ["Raffles Institution", "Raffles Hotel"],
      ["Anglo-Chinese School", "Telok Ayer Chinese Methodist Church"],
      ["Victoria Memorial Hall", "Lim Bo Seng Memorial"],
      ["Former Saint Joseph's Institution (now Singapore Art Museum)", "Saint Joseph's Church"],
      ["Fort Canning Command Centre", "Fort Canning Centre"],
      ["Sri Mariamman Temple", "Sri Srinivasa Perumal Temple"],
    ]) {
      expect(namesMatch(a, b)).toBe(false);
    }
  });

  test("scores zero when either name is only generic words", () => {
    expect(nameOverlap("The Old Building", "Old Building")).toBe(0);
  });
});
