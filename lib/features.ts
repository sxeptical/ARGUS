/**
 * Feature flags shared by the client dashboard and the API routes.
 *
 * These must live in exactly one place: when a feed is disabled, both the
 * route (which short-circuits) and the dashboard (which stops polling and
 * reports the source as intentionally off) derive from the same constant.
 * Re-enabling a feed is a one-line change here.
 */

/** Flight data provider is currently unavailable upstream. */
export const FLIGHTS_ENABLED = false;
