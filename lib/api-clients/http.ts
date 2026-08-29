/**
 * Shared HTTP plumbing for the external API clients.
 *
 * `httpGetJson` is generic over its Effect Schema, so the decoded type is
 * derived from the schema that actually validates the response — callers
 * can no longer pair a schema with an unrelated result type. Timeouts
 * cover the full request → status → body → schema path, and every failure
 * is normalized to the `UpstreamError` union declared in `@/lib/errors`.
 */
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

/**
 * Apply a timeout that covers the whole effect (request, body read, and
 * decode) so a server that sends headers and then stalls the body still
 * surfaces as a `TimeoutError`.
 */
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

/**
 * Normalize an unknown failure from the HTTP pipeline into `UpstreamError`.
 * Unknown shapes become 502 `ExternalApiError`s rather than escaping the
 * typed error channel.
 */
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
 * A single typed HTTP GET that returns the schema-decoded JSON body.
 *
 * The body is read with `.json` and decoded directly with the provided
 * Schema: `HttpClientResponse.schemaJson` wraps the body in
 * `{ status, headers, body }`, which is the wrong shape for the flat
 * upstream payloads used here.
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
