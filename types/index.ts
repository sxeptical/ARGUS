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

export type AirRegionKey = "north" | "south" | "east" | "west" | "central";

export type RegionalAirReadings = Record<AirRegionKey, number | null>;

/** NEA PSI health descriptor. */
export type PsiStatus =
  | "Good"
  | "Moderate"
  | "Unhealthy"
  | "Very Unhealthy"
  | "Hazardous"
  | "Unknown";

/** NEA 1-hr PM2.5 concentration band (I–IV). */
export type Pm25Band = "Normal" | "Elevated" | "High" | "Very High" | "Unknown";

export type AirQualityTone = "success" | "warning" | "danger" | "muted";

/** Per-region values and colour tones drawn by the map's air-quality overlay. */
export type AirQualityOverlay = Record<
  AirRegionKey,
  { value: number | null; tone: AirQualityTone }
>;

export interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  /** NEA 24-hr PSI for the worst region. */
  psi: number | null;
  psiStatus: PsiStatus;
  psiRegions: RegionalAirReadings;
  /** NEA 1-hr PM2.5 (µg/m³) for the worst region. */
  pm25OneHour: number | null;
  pm25OneHourBand: Pm25Band;
  pm25OneHourRegions: RegionalAirReadings;
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
 * Normalized LTA alert with display line names where known. Times are
 * LTA-supplied strings in Singapore local time.
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

export type SearchResultType = "bus-stop" | "mrt" | "park";

export interface MapSearchResult {
  id: string;
  type: SearchResultType;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  keywords: string[];
}