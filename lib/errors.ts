/** Server errors mapped to HTTP responses by the route helper. */

/** An upstream API failed or answered with a non-2xx `status`. */
export class ExternalApiError extends Error {
  readonly service: string;
  readonly status: number;

  constructor(options: { service: string; message: string; status: number }) {
    super(options.message);
    this.name = "ExternalApiError";
    this.service = options.service;
    this.status = options.status;
  }
}

/** An upstream body was not JSON or did not match its schema. */
export class SchemaParseError extends Error {
  readonly service: string;

  constructor(options: { service: string; message: string }) {
    super(options.message);
    this.name = "SchemaParseError";
    this.service = options.service;
  }
}

export class TimeoutError extends Error {
  readonly service: string;

  constructor(options: { service: string; message: string }) {
    super(options.message);
    this.name = "TimeoutError";
    this.service = options.service;
  }
}

/** A well-formed request whose query parameters failed validation (HTTP 400). */
export class BadRequestError extends Error {
  constructor(options: { message: string }) {
    super(options.message);
    this.name = "BadRequestError";
  }
}
