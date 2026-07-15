"use client";

import { useEffect, useMemo, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import FlightPanel from "@/app/components/FlightPanel";
import Map from "@/app/components/Map";
import MrtRoutePanel, {
  MRT_ROUTE_DEFAULTS,
} from "@/app/components/MrtRoutePanel";
import { planMrtRoute } from "@/lib/mrt-routing";
import NewsPanel from "@/app/components/NewsPanel";
import UpdateAvailableToast from "@/app/components/UpdateAvailableToast";
import WeatherPanel from "@/app/components/WeatherPanel";
import { cachedClientFetch } from "@/lib/client-cache";
import type {
  BusStop,
  FlightState,
  NewsItem,
  TrafficCamera,
  WeatherData,
  WeatherHistoryPoint,
} from "@/types";

type SensorKey = "flights" | "cameras" | "busStops" | "mrt";

type SourceStatus = "pending" | "loading" | "ok" | "error";

type SourceState = {
  readonly label: string;
  readonly status: SourceStatus;
  readonly message?: string;
};

const WEATHER_HISTORY_STORAGE_KEY = "argus.weather.history.v1";
const WEATHER_HISTORY_MAX_POINTS = 288; // 24 hours at a 5-minute cadence

const DEFAULT_WEATHER: WeatherData = {
  temperature: null,
  humidity: null,
  psi: null,
  psiStatus: "Unknown",
  forecast: "Loading...",
  lastUpdated: new Date().toISOString(),
};

// Matches the server-side disabled state in app/api/flights/route.ts.
// The flights route returns [] permanently while the upstream provider is
// unavailable. When this flag is true, the client skips scheduling polls
// for /api/flights to avoid wasted network traffic every 15s.
const FLIGHTS_API_DISABLED = true;

const SOURCE_REFRESH_MS = {
  busStops: 60 * 1000,
  cameras: 60 * 1000,
  weather: 5 * 60 * 1000,
  news: 5 * 60 * 1000,
  flights: 15 * 1000,
} as const;

function startPolling(callback: () => void, intervalMs: number) {
  return setInterval(callback, intervalMs);
}

function isWeatherHistoryPoint(value: unknown): value is WeatherHistoryPoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WeatherHistoryPoint>;
  return (
    typeof candidate.timestamp === "string" &&
    (candidate.temperature === null ||
      typeof candidate.temperature === "number") &&
    (candidate.humidity === null || typeof candidate.humidity === "number") &&
    (candidate.psi === null || typeof candidate.psi === "number")
  );
}

function readWeatherHistory(): WeatherHistoryPoint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WEATHER_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isWeatherHistoryPoint)
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
      .slice(-WEATHER_HISTORY_MAX_POINTS);
  } catch {
    return [];
  }
}

function writeWeatherHistory(history: WeatherHistoryPoint[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WEATHER_HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(-WEATHER_HISTORY_MAX_POINTS)),
    );
  } catch {
    // Ignore storage quota / private browsing failures. The live dashboard
    // should keep working even when local history cannot be persisted.
  }
}

function appendWeatherHistory(
  history: WeatherHistoryPoint[],
  weather: WeatherData,
): WeatherHistoryPoint[] {
  const hasReading =
    weather.temperature !== null ||
    weather.humidity !== null ||
    weather.psi !== null;
  if (!hasReading) return history;

  const point: WeatherHistoryPoint = {
    timestamp: weather.lastUpdated,
    temperature: weather.temperature,
    humidity: weather.humidity,
    psi: weather.psi,
  };
  const existingIndex = history.findIndex(
    (item) => item.timestamp === point.timestamp,
  );
  if (
    existingIndex >= 0 &&
    history[existingIndex].temperature === point.temperature &&
    history[existingIndex].humidity === point.humidity &&
    history[existingIndex].psi === point.psi
  ) {
    return history;
  }

  const next =
    existingIndex >= 0
      ? history.map((item, index) => (index === existingIndex ? point : item))
      : [...history, point];

  return next
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-WEATHER_HISTORY_MAX_POINTS);
}

export default function Home() {
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const [weather, setWeather] = useState<WeatherData>(DEFAULT_WEATHER);
  const [weatherHistory, setWeatherHistory] = useState<WeatherHistoryPoint[]>(
    [],
  );
  const [news, setNews] = useState<NewsItem[]>([]);
  const [flights, setFlights] = useState<FlightState[]>([]);
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<TrafficCamera | null>(
    null,
  );
  const [selectedFlight, setSelectedFlight] = useState<FlightState | null>(
    null,
  );
  const [mrtStartStation, setMrtStartStation] = useState(
    MRT_ROUTE_DEFAULTS.start,
  );
  const [mrtEndStation, setMrtEndStation] = useState(MRT_ROUTE_DEFAULTS.end);
  const [mrtMapPickTarget, setMrtMapPickTarget] = useState<"start" | "end">(
    "start",
  );
  const [error, setError] = useState<string | null>(null);
  const [bootComplete, setBootComplete] = useState(false);
  const [sourceStates, setSourceStates] = useState<Record<string, SourceState>>(
    {
      "bus stops": { label: "LTA Bus Network", status: "pending" },
      cameras: { label: "Traffic Cameras", status: "pending" },
      weather: { label: "Weather Grid", status: "pending" },
      news: { label: "OSINT Stream", status: "pending" },
      flights: {
        label: "Airspace Feed",
        status: FLIGHTS_API_DISABLED ? "ok" : "pending",
        message: FLIGHTS_API_DISABLED ? "disabled" : undefined,
      },
    },
  );
  const [sensorVisibility, setSensorVisibility] = useState<
    Record<SensorKey, boolean>
  >({
    flights: true,
    cameras: true,
    busStops: true,
    mrt: true,
  });

  useEffect(() => {
    let mounted = true;
    const failedSources = new Set<string>();

    const syncErrorState = () => {
      if (!mounted) return;
      const errors = Array.from(failedSources);
      setError(
        errors.length > 0
          ? `Some data sources failed: ${errors.join(", ")}`
          : null,
      );
    };

    const updateSourceState = (
      label: string,
      status: SourceStatus,
      message?: string,
    ) => {
      if (!mounted) return;
      setSourceStates((prev) => {
        const current = prev[label];
        if (!current) return prev;
        return {
          ...prev,
          [label]: {
            ...current,
            status,
            message: message ?? current.message,
          },
        };
      });
    };

    const loadSource = async <T,>(
      label: string,
      url: string,
      ttlMs: number,
      setState: (value: T) => void,
    ) => {
      updateSourceState(label, "loading");
      try {
        const data = await cachedClientFetch<T>(url, ttlMs);
        if (!mounted) return;
        setState(data);
        failedSources.delete(label);
        updateSourceState(label, "ok");
      } catch (err) {
        if (!mounted) return;
        failedSources.add(label);
        updateSourceState(
          label,
          "error",
          err instanceof Error ? err.message : "Network error",
        );
      } finally {
        syncErrorState();
      }
    };

    const scheduleSource = <T,>(
      label: string,
      url: string,
      intervalMs: number,
      setState: (value: T) => void,
    ) => {
      return startPolling(() => {
        void loadSource<T>(label, url, intervalMs, setState);
      }, intervalMs);
    };

    void Promise.all([
      loadSource<BusStop[]>(
        "bus stops",
        "/api/bus-stops",
        SOURCE_REFRESH_MS.busStops,
        setBusStops,
      ),
      loadSource<TrafficCamera[]>(
        "cameras",
        "/api/cameras",
        SOURCE_REFRESH_MS.cameras,
        setCameras,
      ),
      loadSource<WeatherData>(
        "weather",
        "/api/weather",
        SOURCE_REFRESH_MS.weather,
        (value) => {
          setWeather(value);
          setWeatherHistory((previous) => {
            const next = appendWeatherHistory(previous, value);
            if (next === previous) return previous;
            writeWeatherHistory(next);
            return next;
          });
        },
      ),
      loadSource<NewsItem[]>(
        "news",
        "/api/news",
        SOURCE_REFRESH_MS.news,
        setNews,
      ),
      // Skip flights polling when the API is permanently disabled — avoids
      // wasteful 15s network round-trips for an always-empty response.
      ...(!FLIGHTS_API_DISABLED
        ? [
            loadSource<FlightState[]>(
              "flights",
              "/api/flights",
              SOURCE_REFRESH_MS.flights,
              setFlights,
            ),
          ]
        : []),
    ])
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(
          err instanceof Error ? err.message : "Unknown dashboard error",
        );
      })
      .finally(() => {
        if (mounted) setBootComplete(true);
      });

    const busStopsTimer = scheduleSource<BusStop[]>(
      "bus stops",
      "/api/bus-stops",
      SOURCE_REFRESH_MS.busStops,
      setBusStops,
    );
    const camerasTimer = scheduleSource<TrafficCamera[]>(
      "cameras",
      "/api/cameras",
      SOURCE_REFRESH_MS.cameras,
      setCameras,
    );
    const weatherTimer = scheduleSource<WeatherData>(
      "weather",
      "/api/weather",
      SOURCE_REFRESH_MS.weather,
      (value) => {
        setWeather(value);
        setWeatherHistory((previous) => {
          const next = appendWeatherHistory(previous, value);
          if (next === previous) return previous;
          writeWeatherHistory(next);
          return next;
        });
      },
    );
    const newsTimer = scheduleSource<NewsItem[]>(
      "news",
      "/api/news",
      SOURCE_REFRESH_MS.news,
      setNews,
    );
    // Skip flights polling when the API is permanently disabled (see
    // FLIGHTS_API_DISABLED constant and app/api/flights/route.ts).
    const flightsTimer = FLIGHTS_API_DISABLED
      ? undefined
      : scheduleSource<FlightState[]>(
          "flights",
          "/api/flights",
          SOURCE_REFRESH_MS.flights,
          setFlights,
        );

    return () => {
      mounted = false;
      clearInterval(busStopsTimer);
      clearInterval(camerasTimer);
      clearInterval(weatherTimer);
      clearInterval(newsTimer);
      if (flightsTimer !== undefined) clearInterval(flightsTimer);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setWeatherHistory(readWeatherHistory()), 0);
    return () => clearTimeout(timer);
  }, []);

  const inboundFlights = useMemo(
    () => flights.filter((flight) => flight.direction === "inbound").length,
    [flights],
  );
  const outboundFlights = useMemo(
    () => flights.filter((flight) => flight.direction === "outbound").length,
    [flights],
  );
  const transitFlights = useMemo(
    () => flights.filter((flight) => flight.direction === "transit").length,
    [flights],
  );
  const mrtRoutePlan = useMemo(
    () => planMrtRoute(mrtStartStation, mrtEndStation),
    [mrtStartStation, mrtEndStation],
  );

  const sensorRows = [
    {
      key: "flights" as const,
      label: "Air Activity",
      note: "live tracks",
      value: flights.length,
      tone: "text-signal-inbound",
    },
    {
      key: "cameras" as const,
      label: "Road Cameras",
      note: "stream nodes",
      value: cameras.length,
      tone: "text-signal-camera",
    },
    {
      key: "busStops" as const,
      label: "Bus Stops",
      note: "monitor points",
      value: busStops.length,
      tone: "text-signal-bus",
    },
    {
      key: "mrt" as const,
      label: "MRT Network",
      note: "lines + stations",
      value: 10,
      tone: "text-signal-mrt",
    },
  ];

  const sensorStatsRows = [
    {
      label: "Inbound Flights",
      note: "approach vector",
      value: inboundFlights,
      tone: "text-signal-inbound",
    },
    {
      label: "Outbound Flights",
      note: "departure vector",
      value: outboundFlights,
      tone: "text-signal-outbound",
    },
    {
      label: "Transit Flights",
      note: "crossing tracks",
      value: transitFlights,
      tone: "text-signal-transit",
    },
    {
      label: "OSINT Feed",
      note: "news stream",
      value: news.length,
      tone: "text-ink",
    },
  ];

  const sources = Object.values(sourceStates);
  const activeSources = sources.filter((source) => source.message !== "disabled");
  const onlineSourceCount = activeSources.filter(
    (source) => source.status === "ok",
  ).length;
  const visibleSensorCount = sensorRows.filter(
    (row) => sensorVisibility[row.key],
  ).length;
  const signalBars = sources.map((source) => ({
    label:
      source.message === "disabled"
        ? `${source.label} (off)`
        : source.label,
    value:
      source.message === "disabled"
        ? 0
        : source.status === "ok"
          ? 100
          : source.status === "loading"
            ? 50
            : 0,
  }));
  const systemStatus = error ? "Degraded" : "Live";

  if (!bootComplete) {
    return <LoadingScreen sources={sources} />;
  }

  return (
    <div className="flex min-h-dvh flex-col gap-2 bg-paper p-2 sm:gap-3 sm:p-3 lg:h-dvh lg:overflow-hidden">
      <UpdateAvailableToast />
      <header className="border border-line bg-surface px-3 py-2 sm:px-4 sm:py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center border border-line-strong bg-ink text-xs font-bold text-paper">
              A
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-[0.16em] text-ink">
                ARGUS
              </div>
              <div className="truncate text-[10px] uppercase tracking-[0.12em] text-muted">
                Singapore signal monitor
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.1em]">
            <HeaderClock />
            <HeaderChip
              label="Sources"
              value={`${onlineSourceCount}/${activeSources.length}`}
            />
            <span
              className={`inline-flex items-center gap-2 whitespace-nowrap font-semibold ${
                error ? "text-warning" : "text-success"
              }`}
            >
              <span className="status-dot" aria-hidden="true" />
              {systemStatus}
            </span>
            <a
              href="https://github.com/sxeptical/ARGUS"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors duration-150 hover:text-ink"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              <span>Source</span>
            </a>
          </div>
        </div>
      </header>

      {error ? (
        <div
          role="status"
          className="border border-warning/40 bg-warning/8 px-3 py-2 text-xs text-warning"
        >
          {error}
        </div>
      ) : null}

      <main className="grid min-w-0 grid-cols-1 gap-2 sm:gap-3 lg:min-h-0 lg:flex-1 xl:grid-cols-[248px_minmax(0,1fr)_292px]">
        <aside className="order-2 flex min-w-0 flex-col gap-2 sm:gap-3 xl:order-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <IntelPanel
            title="Layers"
            badge={`${visibleSensorCount}/${sensorRows.length}`}
          >
            <div className="space-y-1">
              {sensorRows.map((row) => (
                <div
                  key={row.label}
                  className="data-row flex items-center justify-between gap-3 px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs text-ink">{row.label}</div>
                    <div className="data-label truncate">
                      {row.note}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSensorVisibility((prev) => ({
                          ...prev,
                          [row.key]: !prev[row.key],
                        }))
                      }
                      aria-label={`${sensorVisibility[row.key] ? "Hide" : "Show"} ${row.label}`}
                      aria-pressed={sensorVisibility[row.key]}
                      className={`inline-flex min-h-7 items-center whitespace-nowrap border px-2 text-[9px] font-semibold uppercase tracking-[0.1em] transition-colors duration-150 ${
                        sensorVisibility[row.key]
                          ? "border-success/45 bg-success/8 text-success hover:bg-success/12"
                          : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink"
                      }`}
                    >
                      {sensorVisibility[row.key] ? "Shown" : "Hidden"}
                    </button>
                    <div
                      className={`min-w-7 text-right font-mono text-sm font-medium ${row.tone}`}
                    >
                      {row.value}
                    </div>
                  </div>
                </div>
              ))}
              {sensorStatsRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-3 border-b border-line px-2.5 py-2 last:border-b-0"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs text-ink">{row.label}</div>
                    <div className="data-label truncate">
                      {row.note}
                    </div>
                  </div>
                  <div className={`font-mono text-sm font-medium ${row.tone}`}>
                    {row.value}
                  </div>
                </div>
              ))}
            </div>
          </IntelPanel>

          <WeatherPanel weather={weather} history={weatherHistory} />
          <FlightPanel
            flights={flights}
            selectedFlight={selectedFlight}
            onSelectFlight={setSelectedFlight}
          />
        </aside>

        <section className="order-1 grid min-w-0 gap-2 sm:gap-3 xl:order-2 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(236px,38%)]">
          <section className="relative h-[52dvh] min-h-72 overflow-hidden border border-line bg-surface xl:h-auto xl:min-h-0">
            <Map
              busStops={busStops}
              cameras={cameras}
              flights={flights}
              sensorVisibility={sensorVisibility}
              onStopClick={setSelectedStop}
              onCameraClick={setSelectedCamera}
              onFlightClick={setSelectedFlight}
              onMrtStationClick={(stationName) => {
                if (mrtMapPickTarget === "start") {
                  setMrtStartStation(stationName);
                  setMrtMapPickTarget("end");
                } else {
                  setMrtEndStation(stationName);
                  setMrtMapPickTarget("start");
                }
              }}
              mrtRouteSegments={mrtRoutePlan?.segments ?? []}
            />
            <div className="pointer-events-none absolute left-2 top-2 border border-line bg-overlay px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink">
              Live map <span className="ml-2 text-muted">Singapore</span>
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap gap-x-3 gap-y-1 border border-line bg-overlay px-2.5 py-1.5 text-[9px] uppercase tracking-[0.1em] text-muted sm:right-auto">
              <LegendDot tone="bg-signal-inbound" label="Inbound" />
              <LegendDot tone="bg-signal-outbound" label="Outbound" />
              <LegendDot tone="bg-signal-transit" label="Transit" />
              <LegendDot tone="bg-signal-bus" label="Bus" />
              <LegendDot tone="bg-signal-camera" label="Cameras" />
              <LegendDot tone="bg-signal-mrt" label="MRT" />
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 2xl:grid-cols-4">
            <div className="min-h-0 overflow-auto">
              <MrtRoutePanel
                startStation={mrtStartStation}
                endStation={mrtEndStation}
                onStartChange={setMrtStartStation}
                onEndChange={setMrtEndStation}
                mapPickTarget={mrtMapPickTarget}
                onMapPickTargetChange={setMrtMapPickTarget}
                onReset={() => {
                  setMrtStartStation(MRT_ROUTE_DEFAULTS.start);
                  setMrtEndStation(MRT_ROUTE_DEFAULTS.end);
                  setMrtMapPickTarget("start");
                }}
              />
            </div>
            <div className="min-h-0 overflow-auto">
              <BusPanel
                busStops={busStops}
                selectedStop={selectedStop}
                onSelectStop={setSelectedStop}
              />
            </div>
            <div className="min-h-0 overflow-auto">
              <NewsPanel news={news} />
            </div>
            <div className="min-h-0 overflow-auto sm:col-span-2 2xl:col-span-1">
              <CameraPanel cameras={cameras} selectedCamera={selectedCamera} />
            </div>
          </section>
        </section>

        <aside className="order-3 flex min-w-0 flex-col gap-2 sm:gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <IntelPanel title="Intelligence" badge={`${news.length} signals`}>
            <div className="space-y-1.5">
              {news.slice(0, 6).map((item) => (
                <a
                  key={`${item.url}-${item.publishedAt}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="interactive-row block px-2.5 py-2"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.1em] text-muted">
                    <span className="truncate">{item.source}</span>
                    <span suppressHydrationWarning>
                      {new Date(item.publishedAt).toLocaleTimeString("en-SG", {
                        timeZone: "Asia/Singapore",
                      })}
                    </span>
                  </div>
                  <div className="line-clamp-3 text-xs leading-relaxed text-ink">
                    {item.title}
                  </div>
                </a>
              ))}
            </div>
          </IntelPanel>

          <IntelPanel
            title="Source Health"
            badge={`${onlineSourceCount}/${activeSources.length}`}
          >
            <div className="space-y-2">
              {signalBars.map((item) => (
                <SignalBar
                  key={item.label}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </div>
          </IntelPanel>

          <IntelPanel
            title="Target Focus"
            badge={selectedFlight ? "Flight Locked" : "Standby"}
          >
            {selectedFlight ? (
              <div className="space-y-2 text-xs">
                <div className="border border-line bg-paper p-2.5">
                  <div className="font-mono text-sm font-medium text-ink">
                    {selectedFlight.callsign}
                  </div>
                  <div className="data-label">
                    {selectedFlight.originCountry}
                  </div>
                </div>
                <KeyValue
                  label="Direction"
                  value={selectedFlight.direction.toUpperCase()}
                />
                <KeyValue
                  label="Altitude"
                  value={formatAltitudeFeet(selectedFlight.altitude)}
                />
                <KeyValue
                  label="Speed"
                  value={formatSpeedKmh(selectedFlight.velocity)}
                />
                <KeyValue
                  label="Track"
                  value={
                    selectedFlight.track !== null
                      ? `${Math.round(selectedFlight.track)}°`
                      : "N/A"
                  }
                />
              </div>
            ) : (
              <div className="text-xs leading-relaxed text-muted">
                Select a flight icon on the map to inspect its live vector.
              </div>
            )}
          </IntelPanel>
        </aside>
      </main>
    </div>
  );
}

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  return (
    <span suppressHydrationWarning>
      <HeaderChip
        label={now.toLocaleDateString("en-SG", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Singapore",
        })}
        value={now.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore" })}
      />
    </span>
  );
}

function HeaderChip({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 whitespace-nowrap text-muted ${className ?? ""}`}
    >
      <span className="text-faint">{label}</span>
      <span className="font-mono text-ink">{value}</span>
    </span>
  );
}

function LoadingScreen({ sources }: { sources: ReadonlyArray<SourceState> }) {
  const [bootTime] = useState(() => new Date());
  // Latch after 8s so partial-failure help text shows even when the rest
  // of the screen content is otherwise static. Single timeout, no interval,
  // so we only re-render once.
  const [helpReady, setHelpReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHelpReady(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const enabledSources = sources.filter((source) => source.message !== "disabled");
  const totalSources = enabledSources.length;
  const okCount = enabledSources.filter((s) => s.status === "ok").length;
  const errorCount = enabledSources.filter((s) => s.status === "error").length;
  const settledCount = enabledSources.filter(
    (s) => s.status === "ok" || s.status === "error",
  ).length;
  const progress = totalSources === 0 ? 0 : (settledCount / totalSources) * 100;
  const allSettled = settledCount === totalSources;
  const allOk = allSettled && errorCount === 0;
  const allFailed = allSettled && okCount === 0;
  const partial = allSettled && !allOk && !allFailed;

  const headline = allOk
    ? "System ready."
    : allFailed
      ? "Offline — no data sources responded."
      : partial
        ? `Partial signal — ${okCount}/${totalSources} sources online.`
        : "Connecting to data sources...";

  const headlineTone = allOk
    ? "text-success"
    : allFailed
      ? "text-danger"
      : partial
        ? "text-warning"
        : "text-ink";

  const showOfflineHelp =
    allFailed || (settledCount > 0 && errorCount > 0 && helpReady);

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-8 text-ink">
      <div className="w-full max-w-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center border border-line-strong bg-ink text-xs font-bold text-paper">
              A
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.16em]">ARGUS</div>
              <div className="data-label mt-0.5">
                {allFailed ? "Connection failed" : "Connecting sources"}
              </div>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="data-label">Started</div>
            <div className="mt-1 font-mono text-[11px] text-muted" suppressHydrationWarning>
              {bootTime.toLocaleTimeString("en-SG", {
                timeZone: "Asia/Singapore",
              })}
            </div>
          </div>
        </div>

        <div aria-live="polite">
          <div className="mb-2 flex items-end justify-between gap-4">
            <div>
              <div className={`text-sm font-medium ${headlineTone}`}>{headline}</div>
              <div className="mt-1 text-xs text-muted">
                {okCount} of {totalSources} sources online
                {errorCount > 0 ? ` · ${errorCount} failed` : ""}
              </div>
            </div>
            <div className="font-mono text-sm text-ink">
              {Math.min(Math.round(progress), 100)}%
            </div>
          </div>
          <div
            className="h-1 w-full bg-line"
            role="progressbar"
            aria-label="Data source connection progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(Math.round(progress), 100)}
          >
            <div
              className={`h-full ${
                allFailed
                  ? "bg-danger"
                  : partial
                    ? "bg-warning"
                    : "bg-ink"
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {showOfflineHelp && (
          <div className="mt-5 border-l border-warning pl-3 text-xs leading-relaxed text-muted">
            <div className="mb-1 font-medium text-ink">
              {allFailed
                ? "All sources unreachable"
                : "Some sources unreachable"}
            </div>
            <div>
              {allFailed
                ? "The dashboard could not reach any of the data APIs. Check that the server is running and that the API routes are responding. The dashboard will keep retrying every few seconds."
                : "One or more data sources are not responding. The dashboard will retry them on the next refresh. The signals that loaded successfully are still live."}
            </div>
          </div>
        )}

        <div className="mt-8 grid border-t border-line sm:grid-cols-5">
          {sources.map((source) => {
            const isDisabled = source.message === "disabled";
            const isOk = source.status === "ok";
            const isError = source.status === "error";
            const isLoading = source.status === "loading";
            const dotClass = isDisabled
              ? "text-faint"
              : isOk
              ? "text-success"
              : isError
                ? "text-danger"
                : isLoading
                  ? "text-info"
                  : "text-faint";
            const statusLabel = isDisabled
              ? "Disabled"
              : isOk
              ? "Online"
              : isError
                ? "Offline"
                : isLoading
                  ? "Syncing..."
                  : "Queued";
            const statusClass = isDisabled
              ? "text-faint"
              : isOk
              ? "text-success"
              : isError
                ? "text-danger"
                : isLoading
                  ? "text-info"
                  : "text-faint";
            return (
              <div
                key={source.label}
                className="border-b border-line p-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <div className={`mb-2 flex items-center gap-2 ${dotClass}`}>
                  <span className="status-dot" aria-hidden="true" />
                </div>
                <div className="text-[10px] font-medium text-ink">
                  <span>{source.label}</span>
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.1em]">
                  <span className={statusClass}>{statusLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IntelPanel({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-line bg-surface p-2">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-line px-1 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
          {title}
        </h2>
        <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
          {badge}
        </span>
      </div>
      {children}
    </section>
  );
}

function SignalBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-b border-line px-1 py-2 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-muted">
        <span>{label}</span>
        <span className="font-mono text-ink">{value}%</span>
      </div>
      <div
        className="h-1 w-full overflow-hidden bg-line"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div
          className="h-full bg-ink"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-1 py-2 last:border-b-0">
      <span className="data-label">
        {label}
      </span>
      <span className="font-mono text-xs text-ink">{value}</span>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      <span>{label}</span>
    </span>
  );
}

function formatAltitudeFeet(altitude: number | null): string {
  if (!Number.isFinite(altitude)) return "N/A";
  return `${Math.round((altitude as number) * 3.28084).toLocaleString()} ft`;
}

function formatSpeedKmh(speed: number | null): string {
  if (!Number.isFinite(speed)) return "N/A";
  return `${Math.round((speed as number) * 3.6)} km/h`;
}
