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

const SOURCE_REFRESH_MS = {
  busStops: 60 * 1000,
  cameras: 60 * 1000,
  weather: 5 * 60 * 1000,
  news: 5 * 60 * 1000,
  flights: 15 * 1000,
} as const;

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
      flights: { label: "Airspace Feed", status: "pending" },
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
    const timers: Array<ReturnType<typeof setInterval>> = [];

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
      const timer = setInterval(() => {
        void loadSource<T>(label, url, intervalMs, setState);
      }, intervalMs);
      timers.push(timer);
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
      loadSource<FlightState[]>(
        "flights",
        "/api/flights",
        SOURCE_REFRESH_MS.flights,
        setFlights,
      ),
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

    scheduleSource<BusStop[]>(
      "bus stops",
      "/api/bus-stops",
      SOURCE_REFRESH_MS.busStops,
      setBusStops,
    );
    scheduleSource<TrafficCamera[]>(
      "cameras",
      "/api/cameras",
      SOURCE_REFRESH_MS.cameras,
      setCameras,
    );
    scheduleSource<WeatherData>(
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
    scheduleSource<NewsItem[]>(
      "news",
      "/api/news",
      SOURCE_REFRESH_MS.news,
      setNews,
    );
    scheduleSource<FlightState[]>(
      "flights",
      "/api/flights",
      SOURCE_REFRESH_MS.flights,
      setFlights,
    );

    return () => {
      mounted = false;
      timers.forEach((timer) => clearInterval(timer));
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
      tone: "text-[#63ffd6]",
    },
    {
      key: "cameras" as const,
      label: "Road Cameras",
      note: "stream nodes",
      value: cameras.length,
      tone: "text-[#4fc8ff]",
    },
    {
      key: "busStops" as const,
      label: "Bus Stops",
      note: "monitor points",
      value: busStops.length,
      tone: "text-[#90f5ff]",
    },
    {
      key: "mrt" as const,
      label: "MRT Network",
      note: "lines + stations",
      value: 10,
      tone: "text-[#f8d36f]",
    },
  ];

  const sensorStatsRows = [
    {
      label: "Inbound Flights",
      note: "approach vector",
      value: inboundFlights,
      tone: "text-[#63ffd6]",
    },
    {
      label: "Outbound Flights",
      note: "departure vector",
      value: outboundFlights,
      tone: "text-[#ff9c7b]",
    },
    {
      label: "Transit Flights",
      note: "crossing tracks",
      value: transitFlights,
      tone: "text-[#4fc8ff]",
    },
    {
      label: "OSINT Feed",
      note: "news stream",
      value: news.length,
      tone: "text-[#79c9ff]",
    },
  ];

  const signalBars = [
    { label: "Incident Tempo", value: Math.min(100, news.length * 5) },
    {
      label: "Mobility Density",
      value: Math.min(100, Math.round((busStops.length / 5500) * 100)),
    },
    { label: "Air Inbound", value: Math.min(100, inboundFlights * 7) },
    { label: "Air Outbound", value: Math.min(100, outboundFlights * 7) },
    { label: "Sensor Uptime", value: 92 },
  ];

  if (!bootComplete) {
    return <LoadingScreen sources={Object.values(sourceStates)} />;
  }

  return (
    <div className="flex min-h-screen flex-col gap-3 px-2 py-2 sm:px-3 lg:h-screen lg:overflow-hidden">
      <UpdateAvailableToast />
      <a
        href="https://github.com/sxeptical/ARGUS"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="View ARGUS source code on GitHub"
        className="fixed bottom-3 right-3 z-[9999] inline-flex items-center gap-1.5 rounded-sm border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50 backdrop-blur-sm transition-colors hover:border-white/20 hover:text-white/80"
      >
        <svg
          viewBox="0 0 16 16"
          fill="currentColor"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
        </svg>
        GitHub
      </a>
      <header className="rounded-md border border-cyan-400/25 bg-[#04111e]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_rgba(42,166,255,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="[font-family:var(--font-rajdhani)] text-2xl font-semibold uppercase tracking-[0.2em] text-[#e8f5ff]">
              Argus Monitor
            </div>
          </div>
          <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 text-[11px] uppercase tracking-[0.14em] sm:w-auto sm:overflow-visible sm:pb-0">
            <HeaderChip
              label="Visuals"
              value="Full"
              className="hidden sm:inline-flex"
            />
            <HeaderChip
              label="Sweep"
              value="30.1s"
              className="hidden sm:inline-flex"
            />
            <HeaderClock />
            <HeaderChip
              label="Sources"
              value={`${news.length + flights.length}/${busStops.length}`}
            />
            <span className="rounded-sm border border-red-400/50 bg-red-500/10 px-3 py-1 font-semibold text-red-100">
              High Alert
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <main className="grid grid-cols-1 gap-3 lg:min-h-0 lg:flex-1 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="order-2 flex flex-col gap-3 xl:order-1 xl:min-h-0 xl:overflow-auto xl:pr-1">
          <IntelPanel title="Sensor Grid" badge="Live">
            <div className="space-y-1">
              {sensorRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-sm border border-cyan-500/15 bg-[#061325]/70 px-2 py-1.5"
                >
                  <div>
                    <div className="text-xs text-[#cfe6f5]">{row.label}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[#6d90a8]">
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
                      className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        sensorVisibility[row.key]
                          ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-200"
                          : "border-slate-500/50 bg-slate-800/40 text-slate-300"
                      }`}
                    >
                      {sensorVisibility[row.key] ? "On" : "Off"}
                    </button>
                    <div
                      className={`min-w-8 text-right text-lg font-semibold ${row.tone}`}
                    >
                      {row.value}
                    </div>
                  </div>
                </div>
              ))}
              {sensorStatsRows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between rounded-sm border border-cyan-500/15 bg-[#061325]/55 px-2 py-1.5"
                >
                  <div>
                    <div className="text-xs text-[#cfe6f5]">{row.label}</div>
                    <div className="text-[10px] uppercase tracking-widest text-[#6d90a8]">
                      {row.note}
                    </div>
                  </div>
                  <div className={`text-lg font-semibold ${row.tone}`}>
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

        <section className="order-1 grid gap-3 xl:order-2 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(240px,38%)]">
          <section className="relative h-[46vh] min-h-70 overflow-hidden rounded-md border border-cyan-400/25 bg-[#04101a] shadow-[0_0_28px_rgba(18,149,226,0.14)] xl:h-auto xl:min-h-0">
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
            <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap gap-2 rounded-sm border border-cyan-500/15 bg-[#03111f]/82 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-[#80a1b6]">
              <LegendDot tone="bg-[#63ffd6]" label="Inbound" />
              <LegendDot tone="bg-[#ff9c7b]" label="Outbound" />
              <LegendDot tone="bg-[#4fc8ff]" label="Transit" />
              <LegendDot tone="bg-[#77ffc0]" label="Bus Stops" />
              <LegendDot tone="bg-[#71e9ff]" label="Road Cameras" />
              <LegendDot tone="bg-[#f8d36f]" label="MRT Stations" />
            </div>
          </section>

          <section className="grid min-h-0 grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
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

        <aside className="order-3 flex flex-col gap-3 xl:min-h-0 xl:overflow-auto xl:pr-1">
          <IntelPanel title="OSINT Stream" badge={`${news.length} Signals`}>
            <div className="space-y-2">
              {news.slice(0, 6).map((item) => (
                <a
                  key={`${item.url}-${item.publishedAt}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-sm border border-cyan-500/20 bg-[#071327]/75 px-2 py-2 hover:border-cyan-300/60"
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-[#74a7c7]">
                    <span>{item.source}</span>
                    <span suppressHydrationWarning>
                      {new Date(item.publishedAt).toLocaleTimeString("en-SG", {
                        timeZone: "Asia/Singapore",
                      })}
                    </span>
                  </div>
                  <div className="line-clamp-3 text-xs text-[#d8ecf8]">
                    {item.title}
                  </div>
                </a>
              ))}
            </div>
          </IntelPanel>

          <IntelPanel title="Signal Core" badge="Hot Metrics">
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
                <div className="rounded-sm border border-cyan-500/20 bg-[#061428]/70 p-2">
                  <div className="text-sm font-semibold text-[#90f5ff]">
                    {selectedFlight.callsign}
                  </div>
                  <div className="text-[11px] uppercase tracking-widest text-[#6f9eb8]">
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
              <div className="text-xs text-[#789cb3]">
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
      className={`inline-flex rounded-sm border border-cyan-400/25 bg-[#051728]/70 px-2 py-1 text-[#9ec7df] ${className ?? ""}`}
    >
      <span className="text-[#5c86a1]">{label}</span> {value}
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

  const totalSources = sources.length;
  const okCount = sources.filter((s) => s.status === "ok").length;
  const errorCount = sources.filter((s) => s.status === "error").length;
  const settledCount = sources.filter(
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
    ? "text-[#35f0ce]"
    : allFailed
      ? "text-red-300"
      : partial
        ? "text-amber-300"
        : "text-[#cfe6f5]";

  const showOfflineHelp = allFailed || (settledCount > 0 && errorCount > 0 && helpReady);

  return (
    <div className="grid h-screen place-items-center overflow-hidden bg-[#020913] px-4 text-terminal-text">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(33,108,156,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(33,108,156,0.08)_1px,transparent_1px)] bg-size-[72px_72px]" />
      <div
        className={`absolute inset-0 transition-colors duration-700 ${
          allFailed
            ? "bg-[radial-gradient(circle_at_50%_50%,rgba(255,80,80,0.10),transparent_60%)]"
            : "bg-[radial-gradient(circle_at_50%_50%,rgba(42,166,255,0.08),transparent_60%)]"
        }`}
      />

      <div
        className={`relative w-full max-w-3xl rounded-lg border p-6 shadow-[0_0_60px_rgba(42,166,255,0.18)] backdrop-blur-sm transition-colors duration-500 ${
          allFailed
            ? "border-red-400/35 bg-[#1a0a0a]/95 shadow-[0_0_60px_rgba(255,80,80,0.18)]"
            : partial
              ? "border-amber-400/35 bg-[#1a1408]/95"
              : "border-cyan-400/25 bg-[#04111e]/95"
        }`}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
          <div>
            <div className="[font-family:var(--font-rajdhani)] text-3xl font-semibold uppercase tracking-[0.22em] text-[#e8f5ff]">
              ARGUS MONITOR
              {!allOk && (
                <span
                  className="ml-1 inline-block h-5 w-2.5 translate-y-0.5 bg-[#3fd3ff]"
                  style={{ animation: "blink 1s step-end infinite" }}
                />
              )}
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#6d90a8]">
              {allFailed
                ? "Signal surface unreachable"
                : "Initializing Singapore signal surface"}
            </div>
          </div>
          <div className="hidden rounded-sm border border-cyan-400/25 bg-[#051728]/70 px-3 py-2 text-right text-[11px] uppercase tracking-[0.14em] text-[#9ec7df] sm:block">
            <div className="text-[#5c86a1]">Boot Time</div>
            <div suppressHydrationWarning>
              {bootTime.toLocaleTimeString("en-SG", {
                timeZone: "Asia/Singapore",
              })}
            </div>
          </div>
        </div>

        {/* Circular Progress */}
        <div className="mb-4 flex items-center gap-5">
          <div className="relative h-20 w-20 shrink-0">
            <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="#0a2237"
                strokeWidth="3"
              />
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke={
                  allFailed
                    ? "url(#gradFail)"
                    : partial
                      ? "url(#gradPartial)"
                      : "url(#grad)"
                }
                strokeWidth="3"
                strokeDasharray={`${Math.min(progress, 100)} ${100 - Math.min(progress, 100)}`}
                strokeLinecap="round"
                className="transition-all duration-300 ease-out"
              />
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#35f0ce" />
                  <stop offset="50%" stopColor="#3fb9ff" />
                  <stop offset="100%" stopColor="#6e9dff" />
                </linearGradient>
                <linearGradient
                  id="gradPartial"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
                <linearGradient
                  id="gradFail"
                  x1="0%"
                  y1="0%"
                  x2="100%"
                  y2="0%"
                >
                  <stop offset="0%" stopColor="#f87171" />
                  <stop offset="100%" stopColor="#dc2626" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className={`text-lg font-bold ${
                  allFailed
                    ? "text-red-300"
                    : partial
                      ? "text-amber-300"
                      : "text-[#e8f5ff]"
                }`}
              >
                {Math.min(Math.round(progress), 100)}%
              </span>
            </div>
          </div>

          <div className="flex-1">
            <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-[#6d90a8]">
              System Boot
            </div>
            <div className={`text-[12px] font-semibold ${headlineTone}`}>
              {headline}
            </div>
            <div className="mt-1 text-[11px] text-[#8cb2c8]">
              {okCount} of {totalSources} sources online
              {errorCount > 0 ? ` · ${errorCount} failed` : ""}
            </div>
          </div>
        </div>

        {/* Offline help block */}
        {showOfflineHelp && (
          <div
            className={`mb-4 rounded-sm border p-3 text-[11px] leading-relaxed ${
              allFailed
                ? "border-red-400/30 bg-red-500/10 text-red-100"
                : "border-amber-400/30 bg-amber-500/10 text-amber-100"
            }`}
          >
            <div className="mb-1 font-semibold uppercase tracking-[0.14em]">
              {allFailed ? "All sources unreachable" : "Some sources unreachable"}
            </div>
            <div>
              {allFailed
                ? "The dashboard could not reach any of the data APIs. Check that the server is running and that the API routes are responding. The dashboard will keep retrying every few seconds."
                : "One or more data sources are not responding. The dashboard will retry them on the next refresh. The signals that loaded successfully are still live."}
            </div>
          </div>
        )}

        {/* Source cards */}
        <div className="grid gap-2 sm:grid-cols-5">
          {sources.map((source) => {
            const isOk = source.status === "ok";
            const isError = source.status === "error";
            const isLoading = source.status === "loading";
            const dotClass = isOk
              ? "bg-[#35f0ce] shadow-[0_0_6px_rgba(53,240,206,0.8)]"
              : isError
                ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]"
                : isLoading
                  ? "bg-[#3fb9ff] shadow-[0_0_6px_rgba(63,185,255,0.8)]"
                  : "bg-[#0a2237]";
            const borderClass = isOk
              ? "border-[#35f0ce]/30"
              : isError
                ? "border-red-400/40"
                : "border-cyan-500/20";
            const statusLabel = isOk
              ? "Online"
              : isError
                ? "Offline"
                : isLoading
                  ? "Syncing..."
                  : "Queued";
            const statusClass = isOk
              ? "text-[#35f0ce]"
              : isError
                ? "text-red-300"
                : isLoading
                  ? "text-[#3fb9ff]"
                  : "text-[#6d90a8]";
            return (
              <div
                key={source.label}
                className={`rounded-sm border bg-[#071629]/70 p-3 transition-all duration-500 ${borderClass}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-1.5 w-8 rounded-full bg-cyan-300/70" />
                  <div
                    className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${dotClass} ${
                      isLoading ? "animate-pulse" : ""
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.12em] text-[#cfe6f5]">
                  <span>{source.label}</span>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest">
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
    <section className="rounded-md border border-cyan-400/20 bg-[#061223]/85 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_22px_rgba(33,160,255,0.09)]">
      <div className="mb-2 flex items-center justify-between border-b border-cyan-500/15 px-1 pb-2">
        <h2 className="[font-family:var(--font-rajdhani)] text-sm font-semibold uppercase tracking-[0.18em] text-[#8ccff0]">
          {title}
        </h2>
        <span className="rounded-sm border border-cyan-300/35 bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cyan-100">
          {badge}
        </span>
      </div>
      {children}
    </section>
  );
}

function SignalBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-sm border border-cyan-500/15 bg-[#071629]/65 p-2">
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-widest text-[#8cb2c8]">
        <span>{label}</span>
        <span className="text-cyan-200">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-[#0a2237]">
        <div
          className="h-full rounded bg-linear-to-r from-[#35f0ce] via-[#3fb9ff] to-[#6e9dff]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-cyan-500/15 bg-[#071629]/65 px-2 py-1.5">
      <span className="text-[11px] uppercase tracking-widest text-[#7ea4bc]">
        {label}
      </span>
      <span className="text-xs text-[#d8ecf8]">{value}</span>
    </div>
  );
}

function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-2 w-2 rounded-full ${tone}`} />
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
