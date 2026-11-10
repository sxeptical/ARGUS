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
 * `closures` are the NEA cleaning/other-works periods from
 * public/hawker-closures.json, joined by hawker id (empty when the centre
 * has no closure row, e.g. new/planned centres).
 */
export type HawkerClosureKind = "cleaning" | "other-works";

export interface HawkerClosure {
  kind: HawkerClosureKind;
  /** ISO calendar dates (YYYY-MM-DD), inclusive on both ends. */
  start: string;
  end: string;
  remarks: string | null;
}

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
  closures: HawkerClosure[];
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
  /** Year the photo was taken (Commons DateTimeOriginal), when known. */
  year?: number | null;
}

/**
 * Shopping mall from the static amenities bundle (OpenStreetMap location).
 * `stores`, `fnb`, and `nearestMrt` come from the curated mall dataset and
 * are `null` for malls it doesn't cover.
 */
/**
 * Licensed hotel from the static hotel bundle (Hotels Licensing Board via
 * data.gov.sg). The dataset carries no street address, so `address` is the
 * bare postcode; `rooms` is the licensed room count when known.
 */
export interface Hotel {
  id: string;
  name: string;
  address: string | null;
  rooms: number | null;
  lat: number;
  lng: number;
  /** Wikimedia Commons photos (credited per file), when the hotel has an item. */
  photos: PlacePhoto[];
}

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

/**
 * One shop in a mall's directory (public/mall-stores/<mallId>.json). `level`
 * is a normalized key ("B2", "L1", "B2M") or a named area ("Tower 3").
 */
/**
 * Fitness facility from the static gym bundle (All The Places, OpenStreetMap,
 * or SportSG via data.gov.sg). `category` is a display hint derived from the
 * source activity tags; `public` gyms are ActiveSG / SportSG facilities.
 * `brand` is normalised at build time to the operator, or "Independent"
 * for chains without a known operator.
 */
export type GymCategory =
  | "gym"
  | "yoga"
  | "pilates"
  | "martial-arts"
  | "crossfit"
  | "climbing"
  | "public";

export type GymBrand =
  | "ActiveSG"
  | "Anytime Fitness"
  | "Snap Fitness"
  | "F45 Training"
  | "Virgin Active"
  | "CrossFit"
  | "Fitness First"
  | "True Fitness"
  | "Pure Fitness"
  | "UFIT"
  | "GymmBoxx"
  | "24/7 Fitness"
  | "Gold's Gym"
  | "EnergyOne"
  | "GoFit"
  | "Homeground"
  | "Spartans"
  | "Independent";

export type GymSource = "alltheplaces" | "osm" | "sportsg";

export interface Gym {
  id: string;
  name: string;
  brand: GymBrand;
  category: GymCategory;
  address: string | null;
  lat: number;
  lng: number;
  openingHours: string | null;
  website: string | null;
  source: GymSource;
}

/**
 * People's Association outlet from the static community-club bundle
 * (data.gov.sg). `passionwave` outlets are PA's sea-sports facilities.
 */
export type CommunityClubKind = "community-club" | "passionwave";

export interface CommunityClub {
  id: string;
  name: string;
  kind: CommunityClubKind;
  address: string | null;
  lat: number;
  lng: number;
  /** Wikimedia Commons photos (credited per file), when the club has an item. */
  photos: PlacePhoto[];
}

/**
 * Retail pharmacy from the static pharmacy bundle (HSA via data.gov.sg).
 */
export interface Pharmacy {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
}

export interface MallStore {
  name: string;
  unit: string | null;
  level: string | null;
  category: string | null;
  fnb: boolean;
  halal: boolean;
  website: string | null;
}

/** public/mall-stores/index.json: which map malls have a store directory. */
export interface MallStoreIndex {
  fetchedAt: string;
  malls: Record<string, { stores: number; listName: string }>;
}

export interface AmenitiesBundle {
  hawkers: HawkerCentre[];
  malls: Mall[];
}

export type SearchResultType = "bus-stop" | "mrt" | "park" | "mall" | "hawker" | "gym" | "community-club" | "pharmacy" | "hotel";

export interface MapSearchResult {
  id: string;
  type: SearchResultType;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  keywords: string[];
}