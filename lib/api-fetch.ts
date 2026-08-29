/**
 * Typed client-side fetch for the internal JSON API.
 *
 * Every route returns `{ error }` on failure; this unwraps that envelope
 * into a thrown Error so SWR (and other callers) see one consistent shape.
 */
export async function apiFetch<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error || `HTTP ${response.status}: ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
}
