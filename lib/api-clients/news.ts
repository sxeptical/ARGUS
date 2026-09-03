/**
 * News client: merges public Singapore RSS feeds.
 *
 * Failures are honest — when every feed fails, the source fails (so the
 * dashboard reports the source as offline) instead of caching a synthetic
 * "unavailable" item as a healthy 200. Feed bodies are streamed with a hard
 * byte cap so a hostile or broken feed cannot balloon serverless memory,
 * and fetches are abortable so an Effect timeout actually cancels the
 * socket.
 */
import { Cache } from "@/lib/cache";
import { Duration, Effect } from "effect";
import {
  ExternalApiError,
  fromTimeoutException,
  type UpstreamError,
} from "@/lib/errors";
import type { NewsItem } from "@/types";

const RSS_TIMEOUT_MS = 10_000;
const MAX_RSS_BYTES = 512 * 1024; // 512 KB
const SAFE_URL_RE = /^https?:\/\//i;

const rssFeeds: ReadonlyArray<{ readonly source: string; readonly url: string }> = [
  {
    source: "The Straits Times",
    url: "https://www.straitstimes.com/news/singapore/rss.xml",
  },
  {
    source: "CNA",
    // Global feed — Singapore relevance is filtered in getNews by URL path.
    url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml",
  },
];

// ---------- RSS parsing ----------

const HTML_ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  ndash: "–",
  mdash: "—",
  hellip: "…",
};

export const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const code =
          entity[1].toLowerCase() === "x"
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        if (!Number.isFinite(code)) return match;
        try {
          return String.fromCodePoint(code);
        } catch {
          return match;
        }
      }
      const mapped = HTML_ENTITY_MAP[entity.toLowerCase()];
      return mapped ?? match;
    });

const stripHtmlTags = (text: string): string =>
  text.replace(/<[^>]*>/g, "").trim();

export const extractRssTag = (xml: string, tag: string): string => {
  // Tolerate attributes and namespaces: <title>, <title attr>, <dc:title>.
  const pattern = new RegExp(
    `<(?:\\w+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\/(?:\\w+:)?${tag}>`,
    "i",
  );
  const match = xml.match(pattern);
  if (!match?.[1]) {
    // Atom-style self-closed link: <link href="https://…" />
    if (tag.toLowerCase() === "link") {
      const href = xml.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (href?.[1]) return decodeHtmlEntities(href[1]).trim();
    }
    return "";
  }
  return stripHtmlTags(decodeHtmlEntities(match[1])).trim();
};

export const extractRssCategories = (xml: string): string[] => {
  const out: string[] = [];
  const re = /<(?:\w+:)?category(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?category>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const value = stripHtmlTags(decodeHtmlEntities(m[1])).trim();
    if (value) out.push(value);
  }
  return out;
};

const toIsoDate = (value: string): string => {
  const timestamp = value ? Date.parse(value) : Date.now();
  return new Date(
    Number.isFinite(timestamp) ? timestamp : Date.now(),
  ).toISOString();
};

export type ParsedRssItem = NewsItem & { categories: string[] };

export const parseRssItems = (
  xml: string,
  source: string,
): ParsedRssItem[] => {
  // Support both RSS <item> and Atom <entry>.
  const itemMatches =
    xml.match(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi) ??
    [];
  return itemMatches
    .map((rawItem) => {
      const title = extractRssTag(rawItem, "title");
      const link =
        extractRssTag(rawItem, "link") || extractRssTag(rawItem, "guid");
      const publishedAt =
        extractRssTag(rawItem, "pubDate") ||
        extractRssTag(rawItem, "pubdate") ||
        extractRssTag(rawItem, "updated") ||
        extractRssTag(rawItem, "published") ||
        extractRssTag(rawItem, "date");
      const categories = extractRssCategories(rawItem);

      if (!title || !link) return null;
      if (!SAFE_URL_RE.test(link)) return null;

      return {
        title,
        source,
        url: link,
        publishedAt: toIsoDate(publishedAt),
        categories,
      } satisfies ParsedRssItem;
    })
    .filter((item): item is ParsedRssItem => item !== null);
};

/** CNA publishes a global feed — keep items with any Singapore signal. */
export const isSingaporeRelevant = (item: ParsedRssItem): boolean => {
  if (item.source !== "CNA") return true;
  const urlHit = item.url.toLowerCase().includes("singapore");
  if (urlHit) return true;
  if (item.title.toLowerCase().includes("singapore")) return true;
  return item.categories.some((c) => c.toLowerCase().includes("singapore"));
};

// ---------- Bounded, abortable feed fetch ----------

/**
 * Read a response body with a hard byte cap, cancelling the stream as soon
 * as the cap is exceeded. Returns `null` when the feed is too large.
 */
async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  const body = response.body;
  if (!body) {
    const text = await response.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

async function fetchRssBody(
  url: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string | null> {
  const response = await fetch(url, { cache: "no-store", signal });
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const declaredBytes = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  return readBodyWithLimit(response, maxBytes);
}

const fetchRssText = (url: string): Effect.Effect<string, UpstreamError> =>
  Effect.tryPromise({
    try: (signal) => fetchRssBody(url, MAX_RSS_BYTES, signal),
    catch: (error) =>
      new ExternalApiError({
        service: "rss",
        status: 502,
        message:
          error instanceof Error
            ? `RSS fetch failed: ${error.message}`
            : "RSS fetch failed",
      }),
  }).pipe(
    Effect.timeout(Duration.millis(RSS_TIMEOUT_MS)),
    Effect.catchTag("TimeoutException", (cause) =>
      Effect.fail(fromTimeoutException("rss", cause)),
    ),
    Effect.flatMap((text) =>
      text === null
        ? Effect.fail(
            new ExternalApiError({
              service: "rss",
              status: 502,
              message: `RSS feed exceeded ${MAX_RSS_BYTES} bytes: ${url}`,
            }),
          )
        : Effect.succeed(text),
    ),
  );

const fetchRssFeed = (
  feed: { readonly source: string; readonly url: string },
): Effect.Effect<ParsedRssItem[], UpstreamError> =>
  Effect.gen(function* () {
    const xml = yield* fetchRssText(feed.url);
    return parseRssItems(xml, feed.source);
  });

// ---------- Public client ----------

export const getNews = (): Effect.Effect<NewsItem[], UpstreamError, Cache> =>
  Effect.gen(function* () {
    const cache = yield* Cache;
    return yield* cache.get(
      "news",
      15 * 60 * 1000,
      Effect.gen(function* () {
        const results = yield* Effect.all(
          rssFeeds.map((feed) => Effect.either(fetchRssFeed(feed))),
          { concurrency: 2 },
        );

        const succeeded = results.flatMap((result) =>
          result._tag === "Right" ? [result.right] : [],
        );
        if (succeeded.length === 0) {
          return yield* Effect.fail(
            new ExternalApiError({
              service: "rss",
              status: 502,
              message: "All news feeds failed",
            }),
          );
        }

        // Filter CNA items to Singapore-relevant stories (URL, category, or
        // title contains "singapore") so we don't present a global feed
        // as if it were local news.
        const relevant = (succeeded.flat() as ParsedRssItem[]).filter(
          isSingaporeRelevant,
        );
        let merged: NewsItem[] = relevant.map((item) => ({
          title: item.title,
          source: item.source,
          url: item.url,
          publishedAt: item.publishedAt,
        }));

        // Deduplicate by URL across feeds, newest first, capped.
        const seen = new Set<string>();
        merged = merged.filter((item) => {
          if (seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        });

        return merged
          .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
          .slice(0, 20);
      }),
    );
  });
