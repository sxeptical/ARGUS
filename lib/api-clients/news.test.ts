import { describe, expect, test } from "bun:test";
import {
  decodeHtmlEntities,
  extractRssCategories,
  extractRssTag,
  isSingaporeRelevant,
  parseRssItems,
} from "./news";

describe("decodeHtmlEntities", () => {
  test("decodes named, decimal, and hex entities", () => {
    expect(decodeHtmlEntities("a &amp; b")).toBe("a & b");
    expect(decodeHtmlEntities("&ldquo;hi&rdquo;")).toBe("“hi”");
    expect(decodeHtmlEntities("&#39;")).toBe("'");
    expect(decodeHtmlEntities("&#x27;")).toBe("'");
    expect(decodeHtmlEntities("&nbsp;")).toBe(" ");
  });

  test("unwraps CDATA", () => {
    expect(decodeHtmlEntities("<![CDATA[hello &amp; world]]>")).toBe(
      "hello & world",
    );
  });
});

describe("extractRssTag", () => {
  test("reads plain tags", () => {
    expect(extractRssTag("<title>Hello</title>", "title")).toBe("Hello");
  });

  test("tolerates attributes and namespaces", () => {
    expect(extractRssTag('<title type="text">Hi</title>', "title")).toBe("Hi");
    expect(extractRssTag("<dc:date>2026-01-01</dc:date>", "date")).toBe(
      "2026-01-01",
    );
  });

  test("reads Atom link href", () => {
    expect(
      extractRssTag('<link href="https://example.test/a" />', "link"),
    ).toBe("https://example.test/a");
  });

  test("strips inner HTML", () => {
    expect(extractRssTag("<title><b>Bold</b> news</title>", "title")).toBe(
      "Bold news",
    );
  });
});

describe("parseRssItems", () => {
  test("parses RSS items and Atom entries", () => {
    const xml = `
      <rss><channel>
        <item><title>A</title><link>https://example.test/a</link><pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate><category>Singapore</category></item>
        <item><title></title><link>https://example.test/b</link></item>
        <item><title>C</title><link>javascript:alert(1)</link></item>
      </channel></rss>`;
    const items = parseRssItems(xml, "Test");
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("A");
    expect(items[0].categories).toEqual(["Singapore"]);
  });
});

describe("isSingaporeRelevant", () => {
  test("keeps CNA items with category signal even without URL signal", () => {
    expect(
      isSingaporeRelevant({
        title: "Budget debate",
        source: "CNA",
        url: "https://example.test/world/123",
        publishedAt: new Date().toISOString(),
        categories: ["Singapore"],
      }),
    ).toBe(true);
  });

  test("drops CNA global items with no signal", () => {
    expect(
      isSingaporeRelevant({
        title: "Global markets",
        source: "CNA",
        url: "https://example.test/world/123",
        publishedAt: new Date().toISOString(),
        categories: ["World"],
      }),
    ).toBe(false);
  });

  test("always keeps non-CNA sources", () => {
    expect(
      isSingaporeRelevant({
        title: "Anything",
        source: "The Straits Times",
        url: "https://example.test/x",
        publishedAt: new Date().toISOString(),
        categories: [],
      }),
    ).toBe(true);
  });
});

describe("extractRssCategories", () => {
  test("collects multiple categories", () => {
    const xml = `<item><category>Singapore</category><category type="x">Politics</category></item>`;
    expect(extractRssCategories(xml)).toEqual(["Singapore", "Politics"]);
  });
});
