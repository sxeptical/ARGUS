"use client";

import useSWR from "swr";
import { apiFetch } from "@/lib/api-fetch";
import { FLIGHTS_ENABLED } from "@/lib/features";
import type {
  BusStop,
  FlightState,
  NewsItem,
  TrafficCamera,
  WeatherData,
} from "@/types";

export type SourceStatus = "pending" | "loading" | "ok" | "error";

export type SourceState = {
  readonly key: string;
  readonly label: string;
  readonly status: SourceStatus;
  readonly message?: string;
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
  // The server caches this essentially-static national catalogue for 24h;
  // do not transfer thousands of stops every minute.
  refreshMs: 30 * 60 * 1000,
};
const CAMERAS: SourceDefinition = {
  key: "cameras",
  label: "Traffic Cameras",
  url: "/api/cameras",
  refreshMs: 60 * 1000,
};
const WEATHER: SourceDefinition = {
  key: "weather",
  label: "Weather Grid",
  url: "/api/weather",
  refreshMs: 5 * 60 * 1000,
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

const DEFAULT_WEATHER: WeatherData = {
  temperature: null,
  humidity: null,
  psi: null,
  psiStatus: "Unknown",
  forecast: "Loading...",
  lastUpdated: new Date().toISOString(),
};

function useSource<T>(source: SourceDefinition | null) {
  return useSWR<T, Error>(source?.url ?? null, apiFetch<T>, {
    refreshInterval: source?.refreshMs ?? 0,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
    // Boot must settle even when a route hangs: apiFetch times out at 15s,
    // and SWR retries with backoff instead of leaving sources in `loading`.
    dedupingInterval: 5_000,
    errorRetryCount: 3,
    errorRetryInterval: 5_000,
    loadingTimeout: 20_000,
    onLoadingSlow: () => {},
  });
}

function toSourceState(
  source: SourceDefinition,
  result: {
    readonly data: unknown;
    readonly error: Error | undefined;
    readonly isLoading: boolean;
  },
): SourceState {
  if (result.error) {
    return {
      key: source.key,
      label: source.label,
      status: "error",
      message: result.error.message,
    };
  }
  if (result.data !== undefined) {
    return { key: source.key, label: source.label, status: "ok" };
  }
  return {
    key: source.key,
    label: source.label,
    status: result.isLoading ? "loading" : "pending",
  };
}

export function useDashboardSources() {
  // Hooks stay unconditional; a null SWR key disables flights without
  // duplicating the feature flag or changing hook order.
  const busStops = useSource<BusStop[]>(BUS_STOPS);
  const cameras = useSource<TrafficCamera[]>(CAMERAS);
  const weather = useSource<WeatherData>(WEATHER);
  const news = useSource<NewsItem[]>(NEWS);
  const flights = useSource<FlightState[]>(FLIGHTS_ENABLED ? FLIGHTS : null);

  const enabled = [
    { definition: BUS_STOPS, result: busStops },
    { definition: CAMERAS, result: cameras },
    { definition: WEATHER, result: weather },
    { definition: NEWS, result: news },
    ...(FLIGHTS_ENABLED
      ? [{ definition: FLIGHTS, result: flights }]
      : []),
  ];
  const activeSources = enabled.map(({ definition, result }) =>
    toSourceState(definition, result),
  );
  const sources: SourceState[] = FLIGHTS_ENABLED
    ? activeSources
    : [
        ...activeSources,
        {
          key: FLIGHTS.key,
          label: FLIGHTS.label,
          status: "ok",
          message: "disabled",
        },
      ];
  const failedSources = activeSources.filter(
    (source) => source.status === "error",
  );

  return {
    busStops: busStops.data ?? [],
    cameras: cameras.data ?? [],
    weather: weather.data ?? DEFAULT_WEATHER,
    news: news.data ?? [],
    flights: flights.data ?? [],
    sources,
    activeSources,
    onlineSourceCount: activeSources.filter(
      (source) => source.status === "ok",
    ).length,
    bootComplete: enabled.every(
      ({ result }) => result.data !== undefined || result.error !== undefined,
    ),
    error:
      failedSources.length > 0
        ? `Some data sources failed: ${failedSources
            .map((source) => source.key)
            .join(", ")}`
        : null,
  };
}
