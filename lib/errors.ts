/**
 * Tagged error union for the server-side Effect programs.
 *
 * Every external data source and every piece of cross-cutting infrastructure
 * (`Cache`, `RateLimit`, the route handler helper) fails with one of these
 * tags. The route handler helper pattern-matches on `_tag` to map each
 * error to the right HTTP status.
 */
import { Data } from "effect";

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

/** A well-formed request whose query parameters failed validation (HTTP 400). */
export class BadRequestError extends Data.TaggedError("BadRequestError")<{
  readonly message: string;
}> {}

/**
 * The error channel of every external API client. Kept separate from
 * `AppError` so client programs cannot accidentally succeed with a
 * route-only error, while route programs can embed clients directly.
 */
export type UpstreamError =
  | ExternalApiError
  | SchemaParseError
  | TimeoutError;

/**
 * The union of every error a route handler can emit. Use as the `E`
 * parameter of any route-level `Effect` so that the `handle` helper can
 * pattern-match on the tags exhaustively.
 */
export type AppError = UpstreamError | BadRequestError;

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
