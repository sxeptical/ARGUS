/**
 * Effect Schema definitions for every external API response and for every
 * TypeScript interface in `@/types`. The plain TypeScript interfaces remain the
 * source of truth for the React client (which has no Effect runtime); these
 * Schemas are used by the server to validate and decode upstream responses
 * before they reach a route handler.
 *
 * Schemas are intentionally permissive: required fields use their exact
 * type, optional fields use `Schema.optional`, nullable fields use
 * `Schema.NullOr`, and fields we do not consume are not declared. Extra
 * properties in the upstream JSON are ignored.
 */
import { Schema } from "@effect/schema";

// ---------- Domain types (one Schema per public interface) ----------

export const BusStopSchema = Schema.Struct({
  BusStopCode: Schema.String,
  RoadName: Schema.String,
  Description: Schema.String,
  Latitude: Schema.Number,
  Longitude: Schema.Number,
});

const BusTimingSchema = Schema.Struct({
  OriginCode: Schema.String,
  DestinationCode: Schema.String,
  EstimatedArrival: Schema.String,
  Latitude: Schema.String,
  Longitude: Schema.String,
  VisitNumber: Schema.String,
  Load: Schema.String,
  Feature: Schema.String,
  Type: Schema.String,
});

export const BusArrivalSchema = Schema.Struct({
  ServiceNo: Schema.String,
  Operator: Schema.String,
  NextBus: BusTimingSchema,
  NextBus2: Schema.optional(BusTimingSchema),
  NextBus3: Schema.optional(BusTimingSchema),
});

const PsiStatusSchema = Schema.Literal("Good", "Moderate", "Unhealthy", "Unknown");

export const WeatherDataSchema = Schema.Struct({
  temperature: Schema.NullOr(Schema.Number),
  humidity: Schema.NullOr(Schema.Number),
  psi: Schema.NullOr(Schema.Number),
  psiStatus: PsiStatusSchema,
  forecast: Schema.String,
  lastUpdated: Schema.String,
});

export const NewsItemSchema = Schema.Struct({
  title: Schema.String,
  source: Schema.String,
  url: Schema.String,
  publishedAt: Schema.String,
});

export const TrafficCameraSchema = Schema.Struct({
  CameraID: Schema.String,
  Latitude: Schema.Number,
  Longitude: Schema.Number,
  ImageLink: Schema.String,
  location: Schema.String,
});

const FlightDirectionSchema = Schema.Literal("inbound", "outbound", "transit");

export const FlightStateSchema = Schema.Struct({
  id: Schema.String,
  icao24: Schema.String,
  callsign: Schema.String,
  originCountry: Schema.String,
  latitude: Schema.Number,
  longitude: Schema.Number,
  altitude: Schema.NullOr(Schema.Number),
  velocity: Schema.NullOr(Schema.Number),
  track: Schema.NullOr(Schema.Number),
  verticalRate: Schema.NullOr(Schema.Number),
  onGround: Schema.Boolean,
  direction: FlightDirectionSchema,
  lastContact: Schema.NullOr(Schema.Number),
});

// ---------- Upstream response wrappers ----------

export const LtaBusStopsResponseSchema = Schema.Struct({
  value: Schema.Array(BusStopSchema),
});

export const LtaBusArrivalsResponseSchema = Schema.Struct({
  Services: Schema.Array(BusArrivalSchema),
});

const RawTrafficImageSchema = Schema.Struct({
  CameraID: Schema.String,
  Latitude: Schema.Number,
  Longitude: Schema.Number,
  ImageLink: Schema.String,
});

const TrafficImageCamerasEntrySchema = Schema.Struct({
  Cameras: Schema.Array(RawTrafficImageSchema),
});

/**
 * LTA returns one of two shapes for the Traffic-Imagesv2 endpoint depending
 * on the upstream wrapper version. Both shapes are accepted; the route
 * handler normalizes them into `TrafficCamera[]`.
 */
export const LtaTrafficImagesResponseSchema = Schema.Union(
  Schema.Struct({ value: Schema.Array(RawTrafficImageSchema) }),
  Schema.Struct({ value: Schema.Array(TrafficImageCamerasEntrySchema) }),
);

const ForecastEntrySchema = Schema.Struct({
  area: Schema.String,
  forecast: Schema.String,
});

const ForecastItemSchema = Schema.Struct({
  timestamp: Schema.optional(Schema.String),
  update_timestamp: Schema.optional(Schema.String),
  forecasts: Schema.optional(Schema.Array(ForecastEntrySchema)),
});

export const DataGovForecastResponseSchema = Schema.Struct({
  area_metadata: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String }))),
  items: Schema.optional(Schema.Array(ForecastItemSchema)),
});

const PsiReadingSchema = Schema.Struct({
  psi_twenty_four_hourly: Schema.optional(
    Schema.Struct({
      national: Schema.optional(Schema.Number),
      north: Schema.optional(Schema.Number),
      east: Schema.optional(Schema.Number),
      west: Schema.optional(Schema.Number),
      central: Schema.optional(Schema.Number),
      south: Schema.optional(Schema.Number),
    }),
  ),
});

const PsiItemSchema = Schema.Struct({
  timestamp: Schema.optional(Schema.String),
  update_timestamp: Schema.optional(Schema.String),
  readings: Schema.optional(PsiReadingSchema),
});

export const DataGovPsiResponseSchema = Schema.Struct({
  items: Schema.optional(Schema.Array(PsiItemSchema)),
});

const TemperatureReadingSchema = Schema.Struct({ value: Schema.Number });

const TemperatureItemSchema = Schema.Struct({
  timestamp: Schema.optional(Schema.String),
  update_timestamp: Schema.optional(Schema.String),
  readings: Schema.optional(Schema.Array(TemperatureReadingSchema)),
});

export const DataGovTemperatureResponseSchema = Schema.Struct({
  items: Schema.optional(Schema.Array(TemperatureItemSchema)),
});

export const DataGovHumidityResponseSchema = DataGovTemperatureResponseSchema;

// ---------- Aviationstack ----------

const AviationStackLiveSchema = Schema.Struct({
  updated: Schema.optional(Schema.NullOr(Schema.String)),
  latitude: Schema.optional(Schema.NullOr(Schema.Number)),
  longitude: Schema.optional(Schema.NullOr(Schema.Number)),
  altitude: Schema.optional(Schema.NullOr(Schema.Number)),
  direction: Schema.optional(Schema.NullOr(Schema.Number)),
  speed_horizontal: Schema.optional(Schema.NullOr(Schema.Number)),
  speed_vertical: Schema.optional(Schema.NullOr(Schema.Number)),
  is_ground: Schema.optional(Schema.NullOr(Schema.Boolean)),
});

const AviationStackEndpointSchema = Schema.Struct({
  airport: Schema.optional(Schema.NullOr(Schema.String)),
  iata: Schema.optional(Schema.NullOr(Schema.String)),
  icao: Schema.optional(Schema.NullOr(Schema.String)),
});

const AviationStackAirlineSchema = Schema.Struct({
  name: Schema.optional(Schema.NullOr(Schema.String)),
  iata: Schema.optional(Schema.NullOr(Schema.String)),
});

const AviationStackFlightIdentifierSchema = Schema.Struct({
  number: Schema.optional(Schema.NullOr(Schema.String)),
  iata: Schema.optional(Schema.NullOr(Schema.String)),
  icao: Schema.optional(Schema.NullOr(Schema.String)),
});

const AviationStackAircraftSchema = Schema.Struct({
  registration: Schema.optional(Schema.NullOr(Schema.String)),
  icao24: Schema.optional(Schema.NullOr(Schema.String)),
});

export const AviationStackFlightSchema = Schema.Struct({
  departure: Schema.optional(Schema.NullOr(AviationStackEndpointSchema)),
  arrival: Schema.optional(Schema.NullOr(AviationStackEndpointSchema)),
  airline: Schema.optional(Schema.NullOr(AviationStackAirlineSchema)),
  flight: Schema.optional(Schema.NullOr(AviationStackFlightIdentifierSchema)),
  aircraft: Schema.optional(Schema.NullOr(AviationStackAircraftSchema)),
  live: Schema.optional(Schema.NullOr(AviationStackLiveSchema)),
});

const AviationStackErrorInfoSchema = Schema.Struct({
  code: Schema.optional(Schema.Union(Schema.String, Schema.Number)),
  type: Schema.optional(Schema.String),
  info: Schema.optional(Schema.String),
});

export const AviationStackResponseSchema = Schema.Struct({
  data: Schema.optional(Schema.Array(AviationStackFlightSchema)),
  error: Schema.optional(AviationStackErrorInfoSchema),
});

// ---------- OpenSky ----------

/**
 * OpenSky state vectors are a positional 18-tuple. We declare every position
 * (0-17) so the decoder validates the array length; positions we don't read
 * are typed as `Schema.Unknown` so the decode is robust to upstream adding
 * or reordering columns.
 */
const OpenSkyNullableString = Schema.NullOr(Schema.String);
const OpenSkyNullableNumber = Schema.NullOr(Schema.Number);
const OpenSkyNullableBoolean = Schema.NullOr(Schema.Boolean);

export const OpenSkyStateSchema = Schema.Tuple(
  OpenSkyNullableString, // 0  icao24
  OpenSkyNullableString, // 1  callsign
  OpenSkyNullableString, // 2  origin_country
  OpenSkyNullableNumber, // 3  time_position
  OpenSkyNullableNumber, // 4  last_contact
  OpenSkyNullableNumber, // 5  longitude
  OpenSkyNullableNumber, // 6  latitude
  OpenSkyNullableNumber, // 7  baro_altitude
  OpenSkyNullableBoolean, // 8  on_ground
  OpenSkyNullableNumber, // 9  velocity
  OpenSkyNullableNumber, // 10 true_track
  OpenSkyNullableNumber, // 11 vertical_rate
  Schema.Unknown, // 12  sensors
  OpenSkyNullableNumber, // 13  geo_altitude
  OpenSkyNullableString, // 14  squawk
  OpenSkyNullableBoolean, // 15  spi
  OpenSkyNullableNumber, // 16  position_source
  OpenSkyNullableNumber, // 17  category
);

export const OpenSkyResponseSchema = Schema.Struct({
  time: Schema.Number,
  states: Schema.NullOr(Schema.Array(OpenSkyStateSchema)),
});
