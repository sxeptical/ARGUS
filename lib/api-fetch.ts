/**
 * Fetches internal JSON APIs, converting error envelopes to thrown errors.
 * The timeout prevents hung routes from blocking dashboard startup.
 */

const TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  // Respect a caller-provided signal (e.g. use-bus-route cancellation) by
  // forwarding its abort to our controller. Handle an already-aborted signal
  // before subscribing: `abort` fires only once and may have already passed.
  const onCallerAbort = () => controller.abort();
  if (init?.signal?.aborted) {
    controller.abort(init.signal.reason);
  } else {
    init?.signal?.addEventListener?.("abort", onCallerAbort, { once: true });
  }

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
      throw new Error(`Request timed out after ${TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener?.("abort", onCallerAbort);
  }
}
