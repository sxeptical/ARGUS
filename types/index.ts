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
