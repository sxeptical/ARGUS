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

export interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  psi: number | null;
  psiStatus: "Good" | "Moderate" | "Unhealthy" | "Unknown";
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
  psi: number | null;
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
    };
  }>;
}
