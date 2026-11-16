import { afterEach, describe, expect, test } from "bun:test";
import {
  EMPTY_FEEDBACK_PROMPT_STATE,
  FEEDBACK_AWAY_MS,
  FEEDBACK_MESSAGE_MAX_LENGTH,
  FEEDBACK_SUBMITTED_QUIET_MS,
  FeedbackSubmissionSchema,
  parseFeedbackPromptState,
  shouldPromptFeedback,
} from "@/lib/feedback";
import { GET, POST } from "@/app/api/feedback/route";
import { visitorCountry } from "@/lib/visitor-country";

const env = process.env as Record<string, string | undefined>;
const ENV_KEYS = [
  "NODE_ENV",
  "ARGUS_DEV_COUNTRY",
  "ARGUS_TRUST_PROXY_HEADERS",
  "VERCEL",
  "DATABASE_URL",
] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, env[key]]));

const setEnv = (values: Partial<Record<(typeof ENV_KEYS)[number], string>>) => {
  for (const key of ENV_KEYS) {
    if (values[key] === undefined) delete env[key];
    else env[key] = values[key];
  }
};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete env[key];
    else env[key] = originalEnv[key];
  }
});

const requestFrom = (headers: Record<string, string> = {}, init: RequestInit = {}) =>
  new Request("https://example.test/api/feedback", { ...init, headers });

describe("FeedbackSubmissionSchema", () => {
  test("accepts a rating alone and stores a blank comment as null", () => {
    expect(FeedbackSubmissionSchema.parse({ rating: 4 })).toEqual({
      rating: 4,
      message: null,
    });
    expect(FeedbackSubmissionSchema.parse({ rating: 4, message: "   " })).toEqual({
      rating: 4,
      message: null,
    });
  });

  test("trims the comment", () => {
    expect(
      FeedbackSubmissionSchema.parse({ rating: 5, message: "  bus panel is great  " }),
    ).toEqual({ rating: 5, message: "bus panel is great" });
  });

  test("rejects out-of-range ratings and over-long comments", () => {
    for (const rating of [0, 6, 2.5, "5", null]) {
      expect(FeedbackSubmissionSchema.safeParse({ rating }).success).toBe(false);
    }
    expect(
      FeedbackSubmissionSchema.safeParse({
        rating: 3,
        message: "x".repeat(FEEDBACK_MESSAGE_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe("shouldPromptFeedback", () => {
  const now = 1_800_000_000_000;

  test("prompts on a first visit", () => {
    expect(shouldPromptFeedback(EMPTY_FEEDBACK_PROMPT_STATE, now)).toBe(true);
  });

  test("prompts only after being away long enough", () => {
    expect(
      shouldPromptFeedback({ lastSeenAt: now - 60_000, submittedAt: null }, now),
    ).toBe(false);
    expect(
      shouldPromptFeedback(
        { lastSeenAt: now - FEEDBACK_AWAY_MS - 1, submittedAt: null },
        now,
      ),
    ).toBe(true);
  });

  test("stays quiet after feedback was sent, then prompts again", () => {
    const lastSeenAt = now - FEEDBACK_AWAY_MS - 1;
    expect(
      shouldPromptFeedback({ lastSeenAt, submittedAt: now - 60_000 }, now),
    ).toBe(false);
    expect(
      shouldPromptFeedback(
        { lastSeenAt, submittedAt: now - FEEDBACK_SUBMITTED_QUIET_MS - 1 },
        now,
      ),
    ).toBe(true);
  });

  test("parseFeedbackPromptState ignores malformed storage", () => {
    expect(parseFeedbackPromptState(null)).toEqual(EMPTY_FEEDBACK_PROMPT_STATE);
    expect(parseFeedbackPromptState([1, 2])).toEqual(EMPTY_FEEDBACK_PROMPT_STATE);
    expect(parseFeedbackPromptState({ lastSeenAt: "soon", submittedAt: 5 })).toEqual({
      lastSeenAt: null,
      submittedAt: 5,
    });
  });
});

describe("visitorCountry", () => {
  test("ignores geolocation headers off a trusted platform", () => {
    setEnv({ NODE_ENV: "production" });
    expect(
      visitorCountry(requestFrom({ "cf-ipcountry": "SG", "x-vercel-ip-country": "SG" })),
    ).toBeNull();
  });

  test("reads cf-ipcountry behind a trusted proxy", () => {
    setEnv({ NODE_ENV: "production", ARGUS_TRUST_PROXY_HEADERS: "true" });
    expect(visitorCountry(requestFrom({ "cf-ipcountry": "sg" }))).toBe("SG");
    // Cloudflare's "unknown" and Tor codes are not countries.
    expect(visitorCountry(requestFrom({ "cf-ipcountry": "XX" }))).toBeNull();
    expect(visitorCountry(requestFrom({ "cf-ipcountry": "T1" }))).toBeNull();
  });

  test("reads Vercel's header on Vercel", () => {
    setEnv({ NODE_ENV: "production", VERCEL: "1" });
    expect(visitorCountry(requestFrom({ "x-vercel-ip-country": "MY" }))).toBe("MY");
  });

  test("ARGUS_DEV_COUNTRY applies outside production only", () => {
    setEnv({ NODE_ENV: "development", ARGUS_DEV_COUNTRY: "SG" });
    expect(visitorCountry(requestFrom())).toBe("SG");
    setEnv({ NODE_ENV: "production", ARGUS_DEV_COUNTRY: "SG" });
    expect(visitorCountry(requestFrom())).toBeNull();
  });
});

describe("/api/feedback", () => {
  const post = (country: string, body: string) => {
    setEnv({ NODE_ENV: "production", ARGUS_TRUST_PROXY_HEADERS: "true" });
    return POST(
      requestFrom(
        {
          "cf-ipcountry": country,
          "cf-connecting-ip": crypto.randomUUID(),
          "Content-Type": "application/json",
        },
        { method: "POST", body },
      ),
    );
  };

  test("GET reports eligibility for Singapore visitors only", async () => {
    setEnv({ NODE_ENV: "production", ARGUS_TRUST_PROXY_HEADERS: "true" });
    const local = await GET(requestFrom({ "cf-ipcountry": "SG" }));
    expect(await local.json()).toEqual({ eligible: true });
    const abroad = await GET(requestFrom({ "cf-ipcountry": "US" }));
    expect(await abroad.json()).toEqual({ eligible: false });
  });

  test("POST from outside Singapore is rejected with 403", async () => {
    const response = await post("US", JSON.stringify({ rating: 5 }));
    expect(response.status).toBe(403);
  });

  test("POST rejects malformed submissions with 400", async () => {
    expect((await post("SG", "not json")).status).toBe(400);
    expect((await post("SG", JSON.stringify({ rating: 9 }))).status).toBe(400);
    expect((await post("SG", JSON.stringify({ rating: 3, message: "x".repeat(20_000) }))).status).toBe(400);
  });

  test("POST without DATABASE_URL reports the feature as not configured", async () => {
    const response = await post("SG", JSON.stringify({ rating: 5, message: "hi" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Feedback is not configured" });
  });
});
