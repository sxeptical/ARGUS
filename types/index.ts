import type {
  BusArrival as BusArrivalContract,
  BusRouteDirection as BusRouteDirectionContract,
  BusRouteResponse as BusRouteResponseContract,
  BusRouteStop as BusRouteStopContract,
  BusStop as BusStopContract,
  RawTrafficImage,
} from "./schemas";

export type BusStop = BusStopContract;
export type BusArrival = BusArrivalContract;
export type BusRouteStop = BusRouteStopContract;
export type BusRouteDirection = BusRouteDirectionContract;
export type BusRouteResponse = BusRouteResponseContract;

export type AqiRegionKey = "north" | "south" | "east" | "west" | "central";

export type RegionalAqiReadings = Record<AqiRegionKey, number | null>;

export type AqiStatus =
  | "Good"
  | "Moderate"
  | "Unhealthy for Sensitive Groups"
  | "Unhealthy"
  | "Very Unhealthy"
  | "Hazardous"
  | "Unknown";

export interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  /** Worst-region US AQI from 24-hr PM2.5. */
  aqi: number | null;
  aqiStatus: AqiStatus;
  /** Worst-region US AQI from the latest 1-hr PM2.5. */
  aqiOneHour: number | null;
  aqiOneHourStatus: AqiStatus;
  /** Regional US AQI readings for the 24-hr and 1-hr windows. */
  aqiRegions: RegionalAqiReadings;
  aqiOneHourRegions: RegionalAqiReadings;
  uv: number | null;
  uvStatus: "Low" | "Moderate" | "High" | "Very High" | "Extreme" | "Unknown";
  fourDay: Array<{
    day: string;
    text: string;
    tempLow: number;
    tempHigh: number;
  }>;
  forecast: string;
  lastUpdated: string;
}

export interface WeatherHistoryPoint {
  timestamp: string;
  temperature: number | null;
  humidity: number | null;
  aqi: number | null;
}

export interface NewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
}

export type TrafficCamera = RawTrafficImage & { readonly location: string };

export interface TrafficIncident {
  id: string;
  type: string;
  lat: number;
  lng: number;
  message: string;
}

/**
 * One LTA carpark with its live free lots per vehicle class, merged from the
 * per-lot-type DataMall rows. A class the carpark doesn't serve is `null`.
 */
export interface CarparkAvailability {
  id: string;
  name: string;
  area: string;
  agency: string;
  lat: number;
  lng: number;
  carLots: number | null;
  motorcycleLots: number | null;
  heavyLots: number | null;
}

/**
 * One EV charging location, with live connector counts summed across all of
 * its charging points. Connectors that are neither available nor occupied
 * (status unknown or offline) count towards `total` only.
 */
export interface EvChargingLocation {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  available: number;
  occupied: number;
  total: number;
  maxPowerKw: number | null;
  hasDc: boolean;
  operators: string[];
  plugTypes: string[];
}

/**
 * Normalized LTA Train Service Alerts row. `affectedLines` maps LTA line
 * codes to the display names used across the app ("EWL" → "East West
 * Line"); codes without a known display mapping pass through unchanged.
 * `startTime`/`endTime` are LTA-supplied strings already in Singapore
 * local time.
 */
export interface TrainServiceAlert {
  status: "normal" | "disrupted";
  message: string;
  affectedLines: string[];
  affectedStations: string[];
  startTime: string | null;
  endTime: string | null;
}

export type FlightDirection = "inbound" | "outbound" | "transit";

export interface FlightState {
  id: string;
  icao24: string;
  callsign: string;
  originCountry: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  velocity: number | null;
  track: number | null;
  verticalRate: number | null;
  onGround: boolean;
  direction: FlightDirection;
  lastContact: number | null;
}

/** GeoJSON contract used by the restored pre-refactor Map component. */
export interface MRTGeoJson {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      name: string;
      color: string;
      status?: "operational" | "future";
      /** LRT lines are drawn thinner than MRT. */
      mode?: "mrt" | "lrt";
    };
    geometry: {
      type: "LineString";
      coordinates: number[][];
    };
  }>;
}

export type ParkFeatureKind = "park" | "pcn" | "trail";
export interface ParksGeoJson {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Polygon" | "MultiPolygon" | "LineString" | "MultiLineString";
      coordinates: unknown;
    };
    properties: {
      kind: ParkFeatureKind;
      name: string;
      park?: string;
      type?: string;
      cycle?: boolean;
      /** Park areas only, derived at load from the polygon. */
      areaHa?: number;
    };
  }>;
}

/**
 * NEA hawker centre from the static amenities bundle. `planned` centres are
 * under construction; `expectedYear` is NEA's estimated completion year.
 */
export interface HawkerCentre {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  stalls: number | null;
  status: "open" | "planned";
  expectedYear: number | null;
  photos: PlacePhoto[];
}

/**
 * A place photo with the credit it requires: a freely licensed Wikimedia
 * Commons file (`license` set), or NEA's own hawker centre photo.
 */
export interface PlacePhoto {
  thumb: string;
  page: string | null;
  author: string;
  license: string | null;
  source: "commons" | "nea";
}

/**
 * Shopping mall from the static amenities bundle (OpenStreetMap location).
 * `stores`, `fnb`, and `nearestMrt` come from the curated mall dataset and
 * are `null` for malls it doesn't cover.
 */
export interface Mall {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  openingHours: string | null;
  stores: number | null;
  fnb: number | null;
  nearestMrt: string | null;
  photos: PlacePhoto[];
}

export interface AmenitiesBundle {
  hawkers: HawkerCentre[];
  malls: Mall[];
}

export type SearchResultType = "bus-stop" | "mrt" | "park" | "mall" | "hawker";

export interface MapSearchResult {
  id: string;
  type: SearchResultType;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  keywords: string[];
}