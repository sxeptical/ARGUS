/**
 * External API schemas and their derived client contracts. Schemas validate
 * only consumed fields and ignore extra upstream properties.
 */
import { z } from "zod";

const numberOrString = z.union([z.number(), z.string()]);

// ---------- LTA bus stops, arrivals, and routes ----------

const BusStopSchema = z.object({
  BusStopCode: z.string(),
  RoadName: z.string(),
  Description: z.string(),
  Latitude: z.number(),
  Longitude: z.number(),
});
export type BusStop = z.infer<typeof BusStopSchema>;

const BusTimingSchema = z.object({
  OriginCode: z.string(),
  DestinationCode: z.string(),
  EstimatedArrival: z.string(),
  Latitude: z.string(),
  Longitude: z.string(),
  VisitNumber: z.string(),
  Load: z.string(),
  Feature: z.string(),
  Type: z.string(),
});

const BusArrivalSchema = z.object({
  ServiceNo: z.string(),
  Operator: z.string(),
  NextBus: BusTimingSchema,
  NextBus2: BusTimingSchema.optional(),
  NextBus3: BusTimingSchema.optional(),
});
export type BusArrival = z.infer<typeof BusArrivalSchema>;

export const LtaBusStopsResponseSchema = z.object({
  value: z.array(BusStopSchema),
});

export const LtaBusArrivalsResponseSchema = z.object({
  Services: z.array(BusArrivalSchema),
});

/**
 * LTA BusRoutes row. Direction and StopSequence may arrive as number or
 * string depending on upstream serialization; normalize in the client.
 */
const LtaBusRouteRowSchema = z.object({
  ServiceNo: z.string(),
  Direction: numberOrString,
  StopSequence: numberOrString,
  BusStopCode: z.string(),
});

export const LtaBusRoutesResponseSchema = z.object({
  value: z.array(LtaBusRouteRowSchema),
});

// ---------- Bus route response built by /api/bus-routes ----------

export type BusRouteStop = {
  busStopCode: string;
  description: string;
  latitude: number;
  longitude: number;
  stopSequence: number;
};

export type BusRouteDirection = {
  direction: number;
  preferred: boolean;
  selectedStopIndex: number | null;
  originCode: string;
  destinationCode: string;
  stops: BusRouteStop[];
  path: Array<[number, number]>;
  selectedPathIndex: number | null;
};

export type BusRouteResponse = {
  serviceNo: string;
  directions: BusRouteDirection[];
};

// ---------- LTA traffic cameras and incidents ----------

const RawTrafficImageSchema = z.object({
  CameraID: z.string(),
  Latitude: z.number(),
  Longitude: z.number(),
  ImageLink: z.string(),
});
export type RawTrafficImage = z.infer<typeof RawTrafficImageSchema>;

/** Accept both Traffic-Imagesv2 wrapper shapes. */
export const LtaTrafficImagesResponseSchema = z.union([
  z.object({ value: z.array(RawTrafficImageSchema) }),
  z.object({
    value: z.array(z.object({ Cameras: z.array(RawTrafficImageSchema) })),
  }),
]);

const RawTrafficIncidentSchema = z.object({
  Type: z.string(),
  Latitude: z.number(),
  Longitude: z.number(),
  Message: z.string(),
});
export type RawTrafficIncident = z.infer<typeof RawTrafficIncidentSchema>;

export const LtaTrafficIncidentsResponseSchema = z.object({
  value: z.array(RawTrafficIncidentSchema),
});

// ---------- LTA Carpark Availability ----------

/** One row per (carpark, lot type); `Location` is a "lat lng" string. */
const RawCarparkAvailabilitySchema = z.object({
  CarParkID: z.string(),
  Area: z.string(),
  Development: z.string(),
  Location: z.string(),
  AvailableLots: z.number(),
  LotType: z.string(),
  Agency: z.string(),
});
export type RawCarparkAvailability = z.infer<
  typeof RawCarparkAvailabilitySchema
>;

export const LtaCarparkAvailabilityResponseSchema = z.object({
  value: z.array(RawCarparkAvailabilitySchema),
});

// ---------- LTA EV Charging Points (batch) ----------

/** `/EVCBatch` returns a short-lived presigned link to the full snapshot. */
export const LtaEvcBatchResponseSchema = z.object({
  value: z.array(z.object({ Link: z.string() })),
});

const EvPlugTypeSchema = z.object({
  plugType: z.string().optional(),
  current: z.string().optional(),
  powerRating: z.string().optional(),
  evIds: z.array(z.object({ status: z.string().optional() })),
});

const EvChargingPointSchema = z.object({
  operator: z.string().optional(),
  plugTypes: z.array(EvPlugTypeSchema),
});

/** The batch file spells longitude as `longtitude`; accept either. */
const RawEvLocationSchema = z.object({
  name: z.string(),
  address: z.string(),
  latitude: z.number().nullish(),
  longtitude: z.number().nullish(),
  longitude: z.number().nullish(),
  chargingPoints: z.array(EvChargingPointSchema),
});
export type RawEvLocation = z.infer<typeof RawEvLocationSchema>;

export const LtaEvBatchFileSchema = z.object({
  evLocationsData: z.array(RawEvLocationSchema),
});

// ---------- LTA Train Service Alerts ----------

/**
 * One affected segment of a disrupted line. `Line` is an LTA code
 * (e.g. "EWL", "CCL"); `Stations` are station codes, documented by LTA as a
 * comma-separated string (e.g. "NE9,NE8") and also accepted as an array.
 * `Stations` has been observed absent on some alerts.
 */
const TrainAlertSegmentSchema = z.object({
  Line: z.string().nullish(),
  Stations: z.union([z.string(), z.array(z.string())]).nullish(),
});

const LtaTrainServiceAlertSchema = z.object({
  Status: numberOrString.optional(),
  Message: z.array(z.object({ Content: z.string().nullish() })).nullish(),
  AffectedSegments: z.array(TrainAlertSegmentSchema).nullish(),
  Start_time: z.string().nullish(),
  End_time: z.string().nullish(),
});
export type LtaTrainServiceAlert = z.infer<typeof LtaTrainServiceAlertSchema>;

/** Accept `value` as either an alert array or a single all-clear alert. */
export const LtaTrainServiceAlertsResponseSchema = z.union([
  z.object({ value: z.array(LtaTrainServiceAlertSchema) }),
  z.object({ value: LtaTrainServiceAlertSchema }),
]);
export type LtaTrainServiceAlertsResponse = z.infer<
  typeof LtaTrainServiceAlertsResponseSchema
>;

// ---------- Data.gov.sg v1 ----------

const timestamps = {
  timestamp: z.string().optional(),
  update_timestamp: z.string().optional(),
};

export const DataGovForecastResponseSchema = z.object({
  items: z
    .array(
      z.object({
        ...timestamps,
        forecasts: z
          .array(z.object({ area: z.string(), forecast: z.string() }))
          .optional(),
      }),
    )
    .optional(),
});

const RegionalReadingSchema = z.object({
  national: z.number().optional(),
  north: z.number().optional(),
  east: z.number().optional(),
  west: z.number().optional(),
  central: z.number().optional(),
  south: z.number().optional(),
});

export const DataGovPsiResponseSchema = z.object({
  items: z
    .array(
      z.object({
        ...timestamps,
        readings: z
          .object({ psi_twenty_four_hourly: RegionalReadingSchema.optional() })
          .optional(),
      }),
    )
    .optional(),
});

/** Air temperature and relative humidity share this station-readings shape. */
export const DataGovStationReadingsResponseSchema = z.object({
  items: z
    .array(
      z.object({
        ...timestamps,
        readings: z.array(z.object({ value: z.number() })).optional(),
      }),
    )
    .optional(),
});

// ---------- Data.gov.sg v2 ----------

export const DataGovPm25ResponseSchema = z.object({
  data: z.object({
    items: z.array(
      z.object({
        timestamp: z.string().optional(),
        updatedTimestamp: z.string().optional(),
        readings: z.object({
          pm25_one_hourly: RegionalReadingSchema.optional(),
        }),
      }),
    ),
  }),
});

export const DataGovUvResponseSchema = z.object({
  data: z.object({
    records: z.array(
      z.object({
        updatedTimestamp: z.string(),
        timestamp: z.string(),
        index: z.array(z.object({ hour: z.string(), value: z.number() })),
      }),
    ),
  }),
});

export const DataGovFourDayResponseSchema = z.object({
  data: z.object({
    records: z.array(
      z.object({
        timestamp: z.string(),
        forecasts: z.array(
          z.object({
            day: z.string(),
            timestamp: z.string(),
            forecast: z.object({ text: z.string() }),
            temperature: z.object({ low: z.number(), high: z.number() }),
          }),
        ),
      }),
    ),
  }),
});

// ---------- Aviationstack ----------

const AviationStackEndpointSchema = z.object({
  airport: z.string().nullish(),
  iata: z.string().nullish(),
  icao: z.string().nullish(),
});

const AviationStackFlightSchema = z.object({
  departure: AviationStackEndpointSchema.nullish(),
  arrival: AviationStackEndpointSchema.nullish(),
  airline: z
    .object({ name: z.string().nullish(), iata: z.string().nullish() })
    .nullish(),
  flight: z
    .object({
      number: z.string().nullish(),
      iata: z.string().nullish(),
      icao: z.string().nullish(),
    })
    .nullish(),
  aircraft: z
    .object({
      registration: z.string().nullish(),
      icao24: z.string().nullish(),
    })
    .nullish(),
  live: z
    .object({
      updated: z.string().nullish(),
      latitude: z.number().nullish(),
      longitude: z.number().nullish(),
      altitude: z.number().nullish(),
      direction: z.number().nullish(),
      speed_horizontal: z.number().nullish(),
      speed_vertical: z.number().nullish(),
      is_ground: z.boolean().nullish(),
    })
    .nullish(),
});
export type AviationStackFlight = z.infer<typeof AviationStackFlightSchema>;

export const AviationStackResponseSchema = z.object({
  data: z.array(AviationStackFlightSchema).optional(),
  error: z
    .object({
      code: numberOrString.optional(),
      type: z.string().optional(),
      info: z.string().optional(),
    })
    .optional(),
});

// ---------- OpenSky ----------

const nullableString = z.string().nullable();
const nullableNumber = z.number().nullable();
const nullableBoolean = z.boolean().nullable();

/** OpenSky state vectors are fixed positional 18-tuples. */
const OpenSkyStateSchema = z.tuple([
  nullableString, // 0  icao24
  nullableString, // 1  callsign
  nullableString, // 2  origin_country
  nullableNumber, // 3  time_position
  nullableNumber, // 4  last_contact
  nullableNumber, // 5  longitude
  nullableNumber, // 6  latitude
  nullableNumber, // 7  baro_altitude
  nullableBoolean, // 8  on_ground
  nullableNumber, // 9  velocity
  nullableNumber, // 10 true_track
  nullableNumber, // 11 vertical_rate
  z.unknown(), // 12 sensors
  nullableNumber, // 13 geo_altitude
  nullableString, // 14 squawk
  nullableBoolean, // 15 spi
  nullableNumber, // 16 position_source
  nullableNumber, // 17 category
]);

export const OpenSkyResponseSchema = z.object({
  states: z.array(OpenSkyStateSchema).nullable(),
});
