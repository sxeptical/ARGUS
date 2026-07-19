export interface BusStop {
  BusStopCode: string;
  RoadName: string;
  Description: string;
  Latitude: number;
  Longitude: number;
}

interface BusTiming {
  OriginCode: string;
  DestinationCode: string;
  EstimatedArrival: string;
  Latitude: string;
  Longitude: string;
  VisitNumber: string;
  Load: string;
  Feature: string;
  Type: string;
}

export interface BusArrival {
  ServiceNo: string;
  Operator: string;
  NextBus: BusTiming;
  NextBus2?: BusTiming;
  NextBus3?: BusTiming;
}

export interface BusRouteStop {
  busStopCode: string;
  description: string;
  latitude: number;
  longitude: number;
  stopSequence: number;
}

export interface BusRouteDirection {
  direction: number;
  preferred: boolean;
  selectedStopIndex: number | null;
  originCode: string;
  destinationCode: string;
  stops: BusRouteStop[];
  /**
   * Road-following polyline as [lng, lat] pairs when geometry is available
   * (e.g. BusRouter/sgbusdata). Falls back to stop-to-stop chords on the client
   * when empty/absent.
   */
  path: Array<[number, number]>;
  /**
   * Index into `path` nearest the selected stop, for remaining-path emphasis.
   * null when no stop context or path is empty.
   */
  selectedPathIndex: number | null;
}

export interface BusRouteResponse {
  serviceNo: string;
  directions: BusRouteDirection[];
}

export interface WeatherData {
  temperature: number | null;
  humidity: number | null;
  psi: number | null;
  psiStatus: "Good" | "Moderate" | "Unhealthy" | "Unknown";
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

export interface TrafficCamera {
  CameraID: string;
  Latitude: number;
  Longitude: number;
  ImageLink: string;
  location: string;
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
