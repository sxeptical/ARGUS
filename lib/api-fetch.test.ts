import { afterEach, describe, expect, test } from "bun:test";
import { apiFetch } from "./api-fetch";

const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
});

const stubFetch = (
  impl: (input: string | URL | Request, init?: RequestInit) => Promise<Response>,
) => {
  globalThis.fetch = impl as unknown as typeof fetch;
};

describe("apiFetch", () => {
  test("unwraps the JSON response on success", async () => {
    stubFetch(async () => Response.json({ ok: true, count: 3 }));
    await expect(apiFetch<{ ok: boolean; count: number }>("/api/x")).resolves.toEqual(
      { ok: true, count: 3 },
    );
  });

  test("throws the server-provided error message for a non-2xx response", async () => {
    stubFetch(async () =>
      Response.json({ error: "rate limited" }, { status: 429 }),
    );
    await expect(apiFetch("/api/x")).rejects.toThrow("rate limited");
  });

  test("falls back to the HTTP status text when the error body is not JSON", async () => {
    stubFetch(async () =>
      new Response("oops", { status: 500, statusText: "Internal Server Error" }),
    );
    await expect(apiFetch("/api/x")).rejects.toThrow(
      "HTTP 500: Internal Server Error",
    );
  });

  test("prefers the server error envelope over the HTTP status text", async () => {
    stubFetch(async () =>
      new Response(JSON.stringify({ error: "misconfigured" }), {
        status: 502,
        statusText: "Bad Gateway",
      }),
    );
    await expect(apiFetch("/api/x")).rejects.toThrow("misconfigured");
  });

  test("propagates a caller-initiated abort", async () => {
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () =>
              reject(
                new DOMException("The operation was aborted.", "AbortError"),
              ),
            { once: true },
          );
        }),
    );

    const controller = new AbortController();
    const promise = apiFetch("/api/x", { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  test("a request that never settles surfaces as a timeout, not a hang", async () => {
    let fireTimeout: () => void = () => {};
    globalThis.setTimeout = ((fn: () => void) => {
      fireTimeout = fn;
      return 0;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = (() => {}) as unknown as typeof clearTimeout;

    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("aborted", "AbortError")),
            { once: true },
          );
        }),
    );

    const promise = apiFetch("/api/slow");
    fireTimeout();
    await expect(promise).rejects.toThrow(
      "Request timed out after 15s: /api/slow",
    );
  });
});
