/** Schema-validated HTTP requests with timeouts and normalized errors. */
import { HttpClient } from "@effect/platform";
import { Duration, Effect, Schema } from "effect";
import {
  ExternalApiError,
  SchemaParseError,
  TimeoutError,
  fromParseError,
  fromTimeoutException,
  type UpstreamError,
} from "@/lib/errors";

export const DEFAULT_TIMEOUT_MS = 10_000;

/** Time out the entire request, body read, and decode pipeline. */
export const withTimeout = <A, E, R>(
  service: string,
  effect: Effect.Effect<A, E, R>,
  ms: number,
): Effect.Effect<A, E | TimeoutError, R> =>
  effect.pipe(
    Effect.timeout(Duration.millis(ms)),
    Effect.catchTag("TimeoutException", (cause) =>
      Effect.fail(fromTimeoutException(service, cause)),
    ),
  );

const errorTag = (e: unknown): string | undefined =>
  e && typeof e === "object" && "_tag" in e
    ? String((e as { _tag: unknown })._tag)
    : undefined;

/** Normalize HTTP failures; unknown shapes become 502 `ExternalApiError`s. */
export const toAppHttpError = (
  service: string,
  e: unknown,
): ExternalApiError | SchemaParseError | TimeoutError => {
  const tag = errorTag(e);
  if (tag === "TimeoutError") return e as TimeoutError;
  if (tag === "TimeoutException") return fromTimeoutException(service, e);
  if (tag === "SchemaParseError") return e as SchemaParseError;
  if (tag === "ExternalApiError") return e as ExternalApiError;
  // Body decode failures from `response.json` are ResponseError { reason: "Decode" }.
  if (tag === "ResponseError") {
    const reason =
      e && typeof e === "object" && "reason" in e
        ? String((e as { reason: unknown }).reason)
        : "";
    if (reason === "Decode") {
      return new SchemaParseError({
        service,
        message:
          e instanceof Error ? e.message : `${service} returned malformed JSON`,
      });
    }
    return new ExternalApiError({
      service,
      status: 502,
      message:
        e instanceof Error ? e.message : `${service} response body failed`,
    });
  }
  return new ExternalApiError({
    service,
    status: 502,
    message:
      e instanceof Error
        ? e.message
        : `${service} request failed: ${String(e)}`,
  });
};

/**
 * GET and schema-decode a flat JSON body. `HttpClientResponse.schemaJson`
 * is unsuitable because it expects a `{ status, headers, body }` wrapper.
 */
export const httpGetJson = <A, I>(
  service: string,
  url: string,
  headers: Record<string, string>,
  schema: Schema.Schema<A, I, never>,
  timeoutMs: number,
): Effect.Effect<A, UpstreamError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const response = yield* HttpClient.get(url, { headers });

    if (response.status === 404) {
      return yield* Effect.fail(
        new ExternalApiError({
          service,
          status: 404,
          message: `${service} returned 404`,
        }),
      );
    }

    if (response.status < 200 || response.status >= 300) {
      return yield* Effect.fail(
        new ExternalApiError({
          service,
          status: response.status,
          message: `${service} request failed (${response.status})`,
        }),
      );
    }

    const body = yield* response.json;
    return yield* Schema.decodeUnknown(schema)(body).pipe(
      Effect.mapError((cause) => fromParseError(service, cause)),
    );
  }).pipe(
    Effect.timeout(Duration.millis(timeoutMs)),
    Effect.catchAll((e): Effect.Effect<never, UpstreamError> =>
      Effect.fail(toAppHttpError(service, e)),
    ),
  );
