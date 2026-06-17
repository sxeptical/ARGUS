/**
 * Tagged error union for the server-side Effect programs.
 *
 * Every external data source and every piece of cross-cutting infrastructure
 * (`Cache`, `RateLimit`, the route handler helper) fails with one of these
 * tags. The route handler helper `Effect.tapErrorTag` / `Effect.catchTag`
 * discriminates on `_tag` to map each error to the right HTTP status.
 */
import { Data, Effect } from "effect";

export class ExternalApiError extends Data.TaggedError("ExternalApiError")<{
  readonly service: string;
  readonly message: string;
  readonly status: number;
}> {}

export class SchemaParseError extends Data.TaggedError("SchemaParseError")<{
  readonly service: string;
  readonly message: string;
}> {}

export class TimeoutError extends Data.TaggedError("TimeoutError")<{
  readonly service: string;
  readonly message: string;
}> {}

export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly scope: string;
  readonly message: string;
  readonly resetMs: number;
}> {}

/**
 * The union of every error this server emits. Use as the `E` parameter of
 * any route-level `Effect` so that handlers and the `handle` helper can
 * pattern-match on the four tags exhaustively.
 */
export type AppError =
  | ExternalApiError
  | SchemaParseError
  | TimeoutError
  | RateLimitError;

/**
 * Convenience constructor for `TimeoutError` from an `Effect` `TimeoutException`.
 */
export const fromTimeoutException = (
  service: string,
  cause: unknown,
): TimeoutError =>
  new TimeoutError({
    service,
    message: cause instanceof Error ? cause.message : "Request timed out",
  });

/**
 * Convenience constructor for `SchemaParseError` from a `Schema.ParseError`.
 */
export const fromParseError = (
  service: string,
  cause: unknown,
): SchemaParseError =>
  new SchemaParseError({
    service,
    message: cause instanceof Error ? cause.message : "Schema parse failure",
  });

/**
 * Tag the service name on an unknown error from upstream. Returns the original
 * error if it is already one of our `AppError` tags.
 */
export const tagUnknownError = <A, E>(
  service: string,
  effect: Effect.Effect<A, E>,
): Effect.Effect<A, E | ExternalApiError> =>
  Effect.catchAll(effect, (cause) =>
    Effect.fail(
      cause instanceof Error && "name" in cause
        ? new ExternalApiError({
            service,
            message: cause.message,
            status: 502,
          })
        : new ExternalApiError({
            service,
            message: typeof cause === "string" ? cause : "Unknown upstream error",
            status: 502,
          }),
    ),
  );
