/** Schema-validated HTTP requests with timeouts and normalized errors. */
import type { z } from "zod";
import {
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
} from "@/lib/errors";

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Reject with `TimeoutError` when `run` outlives `ms`. The signal aborts at
 * the deadline so `run` can cancel a fetch it owns.
 */
export async function withTimeout<A>(
  service: string,
  ms: number,
  run: (signal: AbortSignal) => Promise<A>,
): Promise<A> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(
        new TimeoutError({
          service,
          message: `${service} timed out after ${ms}ms`,
        }),
      );
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** GET a JSON body and validate it; the timeout covers the body read too. */
export const httpGetJson = <A>(
  service: string,
  url: string,
  headers: Record<string, string>,
  schema: z.ZodType<A>,
  timeoutMs: number,
): Promise<A> =>
  withTimeout(service, timeoutMs, async (signal) => {
    let response: Response;
    try {
      response = await fetch(url, { headers, signal });
    } catch (error) {
      throw new ExternalApiError({
        service,
        status: 502,
        message: `${service} request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new ExternalApiError({
        service,
        status: response.status,
        message: `${service} request failed (${response.status})`,
      });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new SchemaParseError({
        service,
        message: `${service} returned malformed JSON`,
      });
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new SchemaParseError({ service, message: parsed.error.message });
    }
    return parsed.data;
  });
