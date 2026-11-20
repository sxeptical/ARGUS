"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api-fetch";
import { FLIGHTS_ENABLED } from "@/lib/features";
import type {
  BusStop,
  CarparkAvailability,
  EvChargingLocation,
  FlightState,
  NewsItem,
  TrafficCamera,
  TrafficIncident,
  TrainCrowds,
  TrainServiceAlert,
  WeatherAlerts,
  WeatherData,
} from "@/types";

export type SourceStatus = "loading" | "ok" | "stale" | "error";

type SourceState = {
  readonly key: string;
  readonly label: string;
  readonly status: SourceStatus;
};

type SourceDefinition = {
  readonly key: string;
  readonly label: string;
  readonly url: string;
  readonly refreshMs: number;
};

const BUS_STOPS: SourceDefinition = {
  key: "bus stops",
  label: "LTA Bus Network",
  url: "/api/bus-stops",
  // Match the server's 24-hour cache for this large, mostly static catalogue.
  refreshMs: 30 * 60 * 1000,
};
const CAMERAS: SourceDefinition = {
  key: "cameras",
  label: "Traffic Cameras",
  url: "/api/cameras",
  refreshMs: 60 * 1000,
};
const INCIDENTS: SourceDefinition = {
  key: "incidents",
  label: "Road Incidents",
  url: "/api/incidents",
  refreshMs: 60 * 1000,
};
const CARPARKS: SourceDefinition = {
  key: "carparks",
  label: "Carpark Availability",
  url: "/api/carparks",
  refreshMs: 60 * 1000,
};
const EV_CHARGERS: SourceDefinition = {
  key: "ev chargers",
  label: "EV Charging Points",
  url: "/api/ev-chargers",
  // LTA regenerates the EV snapshot every five minutes.
  refreshMs: 5 * 60 * 1000,
};
const WEATHER: SourceDefinition = {
  key: "weather",
  label: "Weather Grid",
  url: "/api/weather",
  refreshMs: 5 * 60 * 1000,
};
const WEATHER_ALERTS: SourceDefinition = {
  key: "lightning & rain",
  label: "Lightning & Rain",
  url: "/api/weather-alerts",
  // NEA logs lightning every two minutes; the server caches for two.
  refreshMs: 2 * 60 * 1000,
};
const NEWS: SourceDefinition = {
  key: "news",
  label: "OSINT Stream",
  url: "/api/news",
  refreshMs: 15 * 60 * 1000,
};
const FLIGHTS: SourceDefinition = {
  key: "flights",
  label: "Airspace Feed",
  url: "/api/flights",
  refreshMs: 15 * 1000,
};
const TRAIN_ALERTS: SourceDefinition = {
  key: "train alerts",
  label: "Train Service Alerts",
  url: "/api/train-alerts",
  // Match the server cache; disruption state changes slowly.
  refreshMs: 60 * 1000,
};

const TRAIN_CROWDS: SourceDefinition = {
  key: "train crowds",
  label: "Train Platform Crowds",
  url: "/api/train-crowds",
  // LTA publishes 10-minute windows; the server caches for five minutes.
  refreshMs: 5 * 60 * 1000,
};

// Stable fallbacks: a fresh [] every render would re-run consumers' effects
// (the map source sync) even when no data arrived.
const EMPTY: never[] = [];
const NO_WEATHER_ALERTS: WeatherAlerts = { lightning: null, rain: null };
const EMPTY_TRAIN_CROWDS: TrainCrowds = { updatedAt: null, stations: [], missingLines: [] };

const EMPTY_REGIONAL_AIR = {
  north: null,
  south: null,
  east: null,
  west: null,
  central: null,
} as const;

const DEFAULT_WEATHER: WeatherData = {
  temperature: null,
  humidity: null,
  psi: null,
  psiStatus: "Unknown",
  psiRegions: EMPTY_REGIONAL_AIR,
  pm25OneHour: null,
  pm25OneHourBand: "Unknown",
  pm25OneHourRegions: EMPTY_REGIONAL_AIR,
  uv: null,
  uvStatus: "Unknown",
  fourDay: [],
  forecast: "Loading...",
  rainOutlook: { nextTwoHours: null, periods: [] },
  lastUpdated: new Date().toISOString(),
};

function useSource<T>(source: SourceDefinition | null, refreshWhenHidden = false) {
  return useSWR<T, Error>(source?.url ?? null, apiFetch<T>, {
    refreshInterval: source?.refreshMs ?? 0,
    refreshWhenHidden,
    revalidateOnFocus: true,
    // Failed feeds retry independently with backoff.
    dedupingInterval: 5_000,
    errorRetryCount: 3,
    errorRetryInterval: 5_000,
  });
}

function toSourceState(
  source: SourceDefinition,
  result: {
    readonly data: unknown;
    readonly error: Error | undefined;
  },
): SourceState {
  const hasData = result.data !== undefined;
  const status = result.error
    ? (hasData ? "stale" : "error")
    : (hasData ? "ok" : "loading");
  return { key: source.key, label: source.label, status };
}

/** Layers whose feeds are only fetched while toggled on. */
export type OnDemandLayers = {
  readonly carparks: boolean;
  readonly evChargers: boolean;
};

export function useDashboardSources(
  onDemand: OnDemandLayers,
  // Only the feeds behind notifications keep polling in a background tab, and
  // only once browser alerts are on, so other users' hidden tabs stay idle.
  pollSignalsWhenHidden: boolean,
) {
  // Hooks stay unconditional; a null SWR key disables flights (and hidden
  // on-demand layers) without changing hook order.
  const busStops = useSource<BusStop[]>(BUS_STOPS);
  const cameras = useSource<TrafficCamera[]>(CAMERAS);
  const incidents = useSource<TrafficIncident[]>(INCIDENTS, pollSignalsWhenHidden);
  const weather = useSource<WeatherData>(WEATHER, pollSignalsWhenHidden);
  const weatherAlerts = useSource<WeatherAlerts>(WEATHER_ALERTS, pollSignalsWhenHidden);
  const news = useSource<NewsItem[]>(NEWS);
  const flights = useSource<FlightState[]>(FLIGHTS_ENABLED ? FLIGHTS : null);
  const trainAlerts = useSource<TrainServiceAlert[]>(TRAIN_ALERTS, pollSignalsWhenHidden);
  const trainCrowds = useSource<TrainCrowds>(TRAIN_CROWDS);
  const carparks = useSource<CarparkAvailability[]>(
    onDemand.carparks ? CARPARKS : null,
  );
  const evChargers = useSource<EvChargingLocation[]>(
    onDemand.evChargers ? EV_CHARGERS : null,
  );

  const feeds = {
    busStops: toSourceState(BUS_STOPS, busStops),
    cameras: toSourceState(CAMERAS, cameras),
    incidents: toSourceState(INCIDENTS, incidents),
    weather: toSourceState(WEATHER, weather),
    weatherAlerts: toSourceState(WEATHER_ALERTS, weatherAlerts),
    news: toSourceState(NEWS, news),
    trainAlerts: toSourceState(TRAIN_ALERTS, trainAlerts),
    trainCrowds: toSourceState(TRAIN_CROWDS, trainCrowds),
  };
  const activeSources = [
    ...Object.values(feeds),
    ...(FLIGHTS_ENABLED ? [toSourceState(FLIGHTS, flights)] : []),
    ...(onDemand.carparks ? [toSourceState(CARPARKS, carparks)] : []),
    ...(onDemand.evChargers ? [toSourceState(EV_CHARGERS, evChargers)] : []),
  ];
  const failedSources = activeSources.filter(
    (source) => source.status === "error" || source.status === "stale",
  );

  return {
    busStops: busStops.data ?? EMPTY,
    cameras: cameras.data ?? EMPTY,
    incidents: incidents.data ?? EMPTY,
    weather: weather.data ?? DEFAULT_WEATHER,
    weatherAlerts: weatherAlerts.data ?? NO_WEATHER_ALERTS,
    news: news.data ?? EMPTY,
    flights: flights.data ?? EMPTY,
    trainAlerts: trainAlerts.data ?? EMPTY,
    trainCrowds: trainCrowds.data ?? EMPTY_TRAIN_CROWDS,
    carparks: carparks.data ?? EMPTY,
    evChargers: evChargers.data ?? EMPTY,
    signalsLoaded: {
      rail: trainAlerts.data !== undefined,
      road: incidents.data !== undefined,
      weather: weather.data !== undefined,
      storm: weatherAlerts.data !== undefined,
    },
    feeds,
    activeSources,
    onlineSourceCount: activeSources.filter(
      (source) => source.status === "ok",
    ).length,
    error:
      failedSources.length > 0
        ? `Some data sources failed: ${failedSources
            .map((source) => source.key)
            .join(", ")}`
        : null,
  };
}
