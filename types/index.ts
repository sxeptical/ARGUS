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

export interface WeatherData {
  temperature: number;
  humidity: number;
  psi: number;
  psiStatus: "Good" | "Moderate" | "Unhealthy";
  forecast: string;
  lastUpdated: string;
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
    };
    geometry: {
      type: "LineString";
      coordinates: number[][];
    };
  }>;
}
