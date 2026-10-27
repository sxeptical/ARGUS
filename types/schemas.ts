/**
 * External API schemas and their derived client contracts. Schemas validate
 * only consumed fields and ignore extra upstream properties.
 */
import { Schema } from "effect";

// ---------- Domain types used by upstream response schemas ----------

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

// ---------- Upstream response wrappers ----------

export const LtaBusStopsResponseSchema = Schema.Struct({
  value: Schema.Array(BusStopSchema),
});

export const LtaBusArrivalsResponseSchema = Schema.Struct({
  Services: Schema.Array(BusArrivalSchema),
});

/**
 * LTA BusRoutes row. Direction and StopSequence may arrive as number or
 * string depending on upstream serialization; normalize in the client.
 */
export const LtaBusRouteRowSchema = Schema.Struct({
  ServiceNo: Schema.String,
  Operator: Schema.optional(Schema.String),
  Direction: Schema.Union(Schema.Number, Schema.String),
  StopSequence: Schema.Union(Schema.Number, Schema.String),
  BusStopCode: Schema.String,
  Distance: Schema.optional(Schema.Union(Schema.Number, Schema.String, Schema.Null)),
  WD_FirstBus: Schema.optional(Schema.String),
  WD_LastBus: Schema.optional(Schema.String),
  SAT_FirstBus: Schema.optional(Schema.String),
  SAT_LastBus: Schema.optional(Schema.String),
  SUN_FirstBus: Schema.optional(Schema.String),
  SUN_LastBus: Schema.optional(Schema.String),
});

export const LtaBusRoutesResponseSchema = Schema.Struct({
  value: Schema.Array(LtaBusRouteRowSchema),
});

export const BusRouteStopSchema = Schema.Struct({
  busStopCode: Schema.String,
  description: Schema.String,
  latitude: Schema.Number,
  longitude: Schema.Number,
  stopSequence: Schema.Number,
});

export const BusRouteDirectionSchema = Schema.Struct({
  direction: Schema.Number,
  preferred: Schema.Boolean,
  selectedStopIndex: Schema.NullOr(Schema.Number),
  originCode: Schema.String,
  destinationCode: Schema.String,
  stops: Schema.Array(BusRouteStopSchema),
  path: Schema.Array(Schema.Tuple(Schema.Number, Schema.Number)),
  selectedPathIndex: Schema.NullOr(Schema.Number),
});

export const BusRouteResponseSchema = Schema.Struct({
  serviceNo: Schema.String,
  directions: Schema.Array(BusRouteDirectionSchema),
});

export const RawTrafficImageSchema = Schema.Struct({
  CameraID: Schema.String,
  Latitude: Schema.Number,
  Longitude: Schema.Number,
  ImageLink: Schema.String,
});

export type RawTrafficImage = Schema.Schema.Type<
  typeof RawTrafficImageSchema
>;

const TrafficImageCamerasEntrySchema = Schema.Struct({
  Cameras: Schema.Array(RawTrafficImageSchema),
});

/** Accept both Traffic-Imagesv2 wrapper shapes. */
export const LtaTrafficImagesResponseSchema = Schema.Union(
  Schema.Struct({ value: Schema.Array(RawTrafficImageSchema) }),
  Schema.Struct({ value: Schema.Array(TrafficImageCamerasEntrySchema) }),
);

export const RawTrafficIncidentSchema = Schema.Struct({
  Type: Schema.String,
  Latitude: Schema.Number,
  Longitude: Schema.Number,
  Message: Schema.String,
});
export type RawTrafficIncident = Schema.Schema.Type<typeof RawTrafficIncidentSchema>;
export const LtaTrafficIncidentsResponseSchema = Schema.Struct({
  value: Schema.Array(RawTrafficIncidentSchema),
});
export type LtaTrafficIncidentsResponse = Schema.Schema.Type<typeof LtaTrafficIncidentsResponseSchema>;

// ---------- LTA Train Service Alerts ----------

const TrainAlertMessageSchema = Schema.Struct({
  Content: Schema.optional(Schema.NullOr(Schema.String)),
});

/**
 * One affected segment of a disrupted line. `Line` is an LTA code
 * (e.g. "EWL", "CCL"); `Stations` are station codes (e.g. "EW23").
 * `Direction` and `Stations` have been observed absent on some alerts.
 */
const TrainAlertSegmentSchema = Schema.Struct({
  Line: Schema.optional(Schema.NullOr(Schema.String)),
  Direction: Schema.optional(Schema.NullOr(Schema.String)),
  Stations: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
});

export const LtaTrainServiceAlertSchema = Schema.Struct({
  Status: Schema.optional(Schema.Union(Schema.Number, Schema.String)),
  StatusDescription: Schema.optional(Schema.NullOr(Schema.String)),
  Message: Schema.optional(Schema.NullOr(Schema.Array(TrainAlertMessageSchema))),
  AffectedSegments: Schema.optional(
    Schema.NullOr(Schema.Array(TrainAlertSegmentSchema)),
  ),
  Start_time: Schema.optional(Schema.NullOr(Schema.String)),
  End_time: Schema.optional(Schema.NullOr(Schema.String)),
});

export type LtaTrainServiceAlert = Schema.Schema.Type<
  typeof LtaTrainServiceAlertSchema
>;

/** Accept `value` as either an alert array or a single all-clear alert. */
export const LtaTrainServiceAlertsResponseSchema = Schema.Union(
  Schema.Struct({ value: Schema.Array(LtaTrainServiceAlertSchema) }),
  Schema.Struct({ value: LtaTrainServiceAlertSchema }),
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

const RegionalReadingSchema = Schema.Struct({
  national: Schema.optional(Schema.Number),
  north: Schema.optional(Schema.Number),
  east: Schema.optional(Schema.Number),
  west: Schema.optional(Schema.Number),
  central: Schema.optional(Schema.Number),
  south: Schema.optional(Schema.Number),
});

const PsiReadingSchema = Schema.Struct({
  psi_twenty_four_hourly: Schema.optional(RegionalReadingSchema),
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

/** Relative humidity currently uses the air-temperature response shape. */
export const DataGovHumidityResponseSchema = DataGovTemperatureResponseSchema;

// ---------- Data.gov.sg v2 ----------

export const DataGovPm25ResponseSchema = Schema.Struct({
  data: Schema.Struct({
    items: Schema.Array(
      Schema.Struct({
        timestamp: Schema.optional(Schema.String),
        updatedTimestamp: Schema.optional(Schema.String),
        readings: Schema.Struct({
          pm25_one_hourly: Schema.optional(RegionalReadingSchema),
        }),
      }),
    ),
  }),
});

const DataGovUvIndexSchema = Schema.Struct({
  hour: Schema.String,
  value: Schema.Number,
});

export const DataGovUvResponseSchema = Schema.Struct({
  code: Schema.Number,
  data: Schema.Struct({
    records: Schema.Array(
      Schema.Struct({
        date: Schema.String,
        updatedTimestamp: Schema.String,
        timestamp: Schema.String,
        index: Schema.Array(DataGovUvIndexSchema),
      }),
    ),
  }),
});

const DataGovFourDayForecastSchema = Schema.Struct({
  day: Schema.String,
  timestamp: Schema.String,
  forecast: Schema.Struct({
    text: Schema.String,
    summary: Schema.optional(Schema.String),
    code: Schema.String,
  }),
  temperature: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
  relativeHumidity: Schema.optional(
    Schema.Struct({
      high: Schema.Number,
      low: Schema.Number,
      unit: Schema.optional(Schema.String),
    }),
  ),
  wind: Schema.optional(
    Schema.Struct({
      direction: Schema.String,
      speed: Schema.Struct({ low: Schema.Number, high: Schema.Number }),
    }),
  ),
});

export const DataGovFourDayResponseSchema = Schema.Struct({
  code: Schema.Number,
  data: Schema.Struct({
    records: Schema.Array(
      Schema.Struct({
        timestamp: Schema.String,
        forecasts: Schema.Array(DataGovFourDayForecastSchema),
      }),
    ),
  }),
});

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

export type AviationStackFlight = Schema.Schema.Type<
  typeof AviationStackFlightSchema
>;

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

/** OpenSky state vectors are fixed positional 18-tuples. */
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

// ---------- Schema-derived contracts ----------

export type BusStop = Schema.Schema.Type<typeof BusStopSchema>;
export type BusArrival = Schema.Schema.Type<typeof BusArrivalSchema>;
export type BusRouteStop = Schema.Schema.Type<typeof BusRouteStopSchema>;
export type BusRouteDirection = Schema.Schema.Type<
  typeof BusRouteDirectionSchema
>;
export type BusRouteResponse = Schema.Schema.Type<
  typeof BusRouteResponseSchema
>;
export type LtaBusStopsResponse = Schema.Schema.Type<
  typeof LtaBusStopsResponseSchema
>;
export type LtaBusArrivalsResponse = Schema.Schema.Type<
  typeof LtaBusArrivalsResponseSchema
>;
export type LtaBusRoutesResponse = Schema.Schema.Type<
  typeof LtaBusRoutesResponseSchema
>;
export type LtaTrafficImagesResponse = Schema.Schema.Type<
  typeof LtaTrafficImagesResponseSchema
>;
export type LtaTrainServiceAlertsResponse = Schema.Schema.Type<
  typeof LtaTrainServiceAlertsResponseSchema
>;
export type DataGovForecastResponse = Schema.Schema.Type<
  typeof DataGovForecastResponseSchema
>;
export type DataGovPsiResponse = Schema.Schema.Type<
  typeof DataGovPsiResponseSchema
>;
export type DataGovTemperatureResponse = Schema.Schema.Type<
  typeof DataGovTemperatureResponseSchema
>;
export type DataGovUvResponse = Schema.Schema.Type<
  typeof DataGovUvResponseSchema
>;
export type DataGovFourDayResponse = Schema.Schema.Type<
  typeof DataGovFourDayResponseSchema
>;
export type AviationStackResponse = Schema.Schema.Type<
  typeof AviationStackResponseSchema
>;
export type OpenSkyState = Schema.Schema.Type<typeof OpenSkyStateSchema>;
export type OpenSkyResponse = Schema.Schema.Type<typeof OpenSkyResponseSchema>;
