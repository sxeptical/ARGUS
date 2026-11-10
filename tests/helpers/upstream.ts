import { cache } from "@/lib/cache";

export type FetchStub = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Run `run` against a stubbed upstream, starting from an empty server cache. */
export async function withFetch<A>(
  fetchImpl: FetchStub,
  run: () => Promise<A>,
): Promise<A> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl as typeof fetch;
  cache.clear();
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    cache.clear();
  }
}

/** The rejection of a promise that is expected to fail. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}
