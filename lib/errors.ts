/** Tagged server errors mapped to HTTP responses by the route helper. */
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

/** Errors emitted by external API clients. */
export type UpstreamError =
  | ExternalApiError
  | SchemaParseError
  | TimeoutError;

/** Error union handled exhaustively by the route helper. */
export type AppError = UpstreamError | BadRequestError;

/** Convert an Effect timeout to `TimeoutError`. */
export const fromTimeoutException = (
  service: string,
  cause: unknown,
): TimeoutError =>
  new TimeoutError({
    service,
    message: cause instanceof Error ? cause.message : "Request timed out",
  });

/** Convert a schema parse failure to `SchemaParseError`. */
export const fromParseError = (
  service: string,
  cause: unknown,
): SchemaParseError =>
  new SchemaParseError({
    service,
    message: cause instanceof Error ? cause.message : "Schema parse failure",
  });
