import { afterEach, describe, expect, test } from "bun:test";
import { GET, getDeploymentVersion } from "@/app/api/version/route";

const env = process.env as Record<string, string | undefined>;
const KEYS = [
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_DEPLOYMENT_ID",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  "OPEN_NEXT_BUILD_ID",
] as const;
const original = Object.fromEntries(KEYS.map((key) => [key, env[key]]));

const setEnv = (values: Partial<Record<(typeof KEYS)[number], string>>) => {
  for (const key of KEYS) {
    if (values[key] === undefined) delete env[key];
    else env[key] = values[key];
  }
};

afterEach(() => {
  for (const key of KEYS) {
    if (original[key] === undefined) delete env[key];
    else env[key] = original[key];
  }
});

describe("getDeploymentVersion", () => {
  test("falls back to development with no version env vars", () => {
    setEnv({});
    expect(getDeploymentVersion()).toBe("development");
  });

  test("uses the Cloudflare/OpenNext build id", () => {
    setEnv({ OPEN_NEXT_BUILD_ID: "  lG0hbJBoiCU8n-kQVftG0  " });
    expect(getDeploymentVersion()).toBe("lG0hbJBoiCU8n-kQVftG0");
  });

  test("prefers a Vercel commit SHA when present", () => {
    setEnv({
      VERCEL_GIT_COMMIT_SHA: "abc123",
      OPEN_NEXT_BUILD_ID: "build-id",
    });
    expect(getDeploymentVersion()).toBe("abc123");
  });

  test("skips blank values", () => {
    setEnv({ VERCEL_GIT_COMMIT_SHA: "  ", OPEN_NEXT_BUILD_ID: "build-id" });
    expect(getDeploymentVersion()).toBe("build-id");
  });
});

describe("GET /api/version", () => {
  test("returns the version with a no-store response", async () => {
    setEnv({ OPEN_NEXT_BUILD_ID: "build-id" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, max-age=0, must-revalidate",
    );
    const payload = (await response.json()) as {
      version: string;
      checkedAt: string;
    };
    expect(payload.version).toBe("build-id");
    expect(Number.isNaN(Date.parse(payload.checkedAt))).toBe(false);
  });
});
