/**
 * Fetches internal JSON APIs, converting error envelopes to thrown errors.
 * The timeout prevents hung routes from blocking dashboard startup.
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
