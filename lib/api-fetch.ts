/**
 * Typed client-side fetch for the internal JSON API.
 *
 * Every route returns `{ error }` on failure; this unwraps that envelope
 * into a thrown Error so SWR (and other callers) see one consistent shape.
 *
 * A client-side timeout guards the boot screen: without it a hung API route
 * (e.g. the multi-page LTA walk) leaves `bootComplete` false forever.
 */

const DEFAULT_CLIENT_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const timeoutMs = DEFAULT_CLIENT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Respect a caller-provided signal (e.g. use-bus-route cancellation) by
  // forwarding its abort to our controller.
  const onCallerAbort = () => controller.abort();
  init?.signal?.addEventListener?.("abort", onCallerAbort, { once: true });

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(
        payload?.error || `HTTP ${response.status}: ${response.statusText}`,
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      if (init?.signal?.aborted) throw error;
      throw new Error(`Request timed out after ${timeoutMs / 1000}s: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener?.("abort", onCallerAbort);
  }
}
