"use client";

import { useEffect, useMemo, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import FlightPanel from "@/app/components/FlightPanel";
import Map from "@/app/components/Map";
import MrtRoutePanel, { MRT_ROUTE_DEFAULTS } from "@/app/components/MrtRoutePanel";
import { planMrtRoute } from "@/lib/mrt-routing";
import NewsPanel from "@/app/components/NewsPanel";
import WeatherPanel from "@/app/components/WeatherPanel";
import type { BusStop, FlightState, NewsItem, TrafficCamera, WeatherData } from "@/types";

type SensorKey = "flights" | "cameras" | "busStops" | "mrt";

const DEFAULT_WEATHER: WeatherData = {
  temperature: 0,
  humidity: 0,
  psi: 0,
  psiStatus: "Good",
  forecast: "Loading...",
  lastUpdated: new Date().toISOString(),
};

async function describeFailedSource(response: Response, label: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ? `${label} (${payload.error})` : label;
  } catch {
    return label;
  }
}

export default function Home() {
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const [weather, setWeather] = useState<WeatherData>(DEFAULT_WEATHER);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [flights, setFlights] = useState<FlightState[]>([]);
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<TrafficCamera | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<FlightState | null>(null);
  const [mrtStartStation, setMrtStartStation] = useState(MRT_ROUTE_DEFAULTS.start);
  const [mrtEndStation, setMrtEndStation] = useState(MRT_ROUTE_DEFAULTS.end);
  const [mrtMapPickTarget, setMrtMapPickTarget] = useState<"start" | "end">("start");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [bootComplete, setBootComplete] = useState(false);
  const [sensorVisibility, setSensorVisibility] = useState<Record<SensorKey, boolean>>({
    flights: true,
    cameras: true,
    busStops: true,
    mrt: true,
  });

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const [busStopsRes, camerasRes, weatherRes, newsRes, flightsRes] = await Promise.allSettled([
        fetch("/api/bus-stops"),
        fetch("/api/cameras"),
        fetch("/api/weather"),
        fetch("/api/news"),
        fetch("/api/flights"),
      ]);

      if (!mounted) return;

      const errors: string[] = [];

      if (busStopsRes.status === "fulfilled") {
        if (busStopsRes.value.ok) {
          setBusStops((await busStopsRes.value.json()) as BusStop[]);
        } else {
          errors.push(await describeFailedSource(busStopsRes.value, "bus stops"));
        }
      } else {
        errors.push("bus stops");
      }

      if (camerasRes.status === "fulfilled") {
        if (camerasRes.value.ok) {
          setCameras((await camerasRes.value.json()) as TrafficCamera[]);
        } else {
          errors.push(await describeFailedSource(camerasRes.value, "cameras"));
        }
      } else {
        errors.push("cameras");
      }

      if (weatherRes.status === "fulfilled") {
        if (weatherRes.value.ok) {
          setWeather((await weatherRes.value.json()) as WeatherData);
        } else {
          errors.push(await describeFailedSource(weatherRes.value, "weather"));
        }
      } else {
        errors.push("weather");
      }

      if (newsRes.status === "fulfilled") {
        if (newsRes.value.ok) {
          setNews((await newsRes.value.json()) as NewsItem[]);
        } else {
          errors.push(await describeFailedSource(newsRes.value, "news"));
        }
      } else {
        errors.push("news");
      }

      if (flightsRes.status === "fulfilled") {
        if (flightsRes.value.ok) {
          setFlights((await flightsRes.value.json()) as FlightState[]);
        } else {
          errors.push(await describeFailedSource(flightsRes.value, "flights"));
        }
      } else {
        errors.push("flights");
      }

      if (errors.length > 0) {
        setError(`Some data sources failed: ${errors.join(", ")}`);
      } else {
        setError(null);
      }
      setBootComplete(true);
    })().catch((err: unknown) => {
      if (!mounted) return;
      setError(err instanceof Error ? err.message : "Unknown dashboard error");
      setBootComplete(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);

    return () => {
      clearInterval(clockTimer);
    };
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
    { label: "Inbound Flights", note: "approach vector", value: inboundFlights, tone: "text-[#63ffd6]" },
    { label: "Outbound Flights", note: "departure vector", value: outboundFlights, tone: "text-[#ff9c7b]" },
    { label: "Transit Flights", note: "crossing tracks", value: transitFlights, tone: "text-[#4fc8ff]" },
    { label: "OSINT Feed", note: "news stream", value: news.length, tone: "text-[#79c9ff]" },
  ];

  const signalBars = [
    { label: "Incident Tempo", value: Math.min(100, news.length * 5) },
    { label: "Mobility Density", value: Math.min(100, Math.round((busStops.length / 5500) * 100)) },
    { label: "Air Inbound", value: Math.min(100, inboundFlights * 7) },
    { label: "Air Outbound", value: Math.min(100, outboundFlights * 7) },
    { label: "Sensor Uptime", value: 92 },
  ];

  if (!bootComplete) {
    return <LoadingScreen now={now} />;
  }

  return (
    <div className="flex min-h-screen flex-col gap-3 px-2 py-2 sm:px-3 lg:h-screen lg:overflow-hidden">
      <header className="rounded-md border border-cyan-400/25 bg-[#04111e]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_rgba(42,166,255,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="[font-family:var(--font-rajdhani)] text-2xl font-semibold uppercase tracking-[0.2em] text-[#e8f5ff]">
              Argus Monitor
            </div>
          </div>
          <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 text-[11px] uppercase tracking-[0.14em] sm:w-auto sm:overflow-visible sm:pb-0">
            <HeaderChip label="Visuals" value="Full" className="hidden sm:inline-flex" />
            <HeaderChip label="Sweep" value="30.1s" className="hidden sm:inline-flex" />
            <HeaderChip
              label={now.toLocaleDateString("en-SG", { month: "short", day: "numeric", year: "numeric" })}
              value={now.toLocaleTimeString("en-SG")}
            />
            <HeaderChip label="Sources" value={`${news.length + flights.length}/${busStops.length}`} />
            <span className="rounded-sm border border-red-400/50 bg-red-500/10 px-3 py-1 font-semibold text-red-100">
              High Alert
            </span>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded border border-red-400/40 bg-red-950/30 px-3 py-2 text-sm text-red-200">{error}</div>
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
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[#6d90a8]">{row.note}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSensorVisibility((prev) => ({ ...prev, [row.key]: !prev[row.key] }))
                      }
                      className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        sensorVisibility[row.key]
                          ? "border-emerald-300/60 bg-emerald-400/15 text-emerald-200"
                          : "border-slate-500/50 bg-slate-800/40 text-slate-300"
                      }`}
                    >
                      {sensorVisibility[row.key] ? "On" : "Off"}
                    </button>
                    <div className={`min-w-8 text-right text-lg font-semibold ${row.tone}`}>{row.value}</div>
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
                    <div className="text-[10px] uppercase tracking-[0.1em] text-[#6d90a8]">{row.note}</div>
                  </div>
                  <div className={`text-lg font-semibold ${row.tone}`}>{row.value}</div>
                </div>
              ))}
            </div>
          </IntelPanel>

          <WeatherPanel weather={weather} />
          <FlightPanel flights={flights} selectedFlight={selectedFlight} onSelectFlight={setSelectedFlight} />
        </aside>

        <section className="order-1 grid gap-3 xl:order-2 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(240px,38%)]">
          <section className="relative h-[46vh] min-h-[280px] overflow-hidden rounded-md border border-cyan-400/25 bg-[#04101a] shadow-[0_0_28px_rgba(18,149,226,0.14)] xl:h-auto xl:min-h-0">
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
              <BusPanel busStops={busStops} selectedStop={selectedStop} onSelectStop={setSelectedStop} />
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
                    <span suppressHydrationWarning>{new Date(item.publishedAt).toLocaleTimeString("en-SG")}</span>
                  </div>
                  <div className="line-clamp-3 text-xs text-[#d8ecf8]">{item.title}</div>
                </a>
              ))}
            </div>
          </IntelPanel>

          <IntelPanel title="Signal Core" badge="Hot Metrics">
            <div className="space-y-2">
              {signalBars.map((item) => (
                <SignalBar key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </IntelPanel>

          <IntelPanel title="Target Focus" badge={selectedFlight ? "Flight Locked" : "Standby"}>
            {selectedFlight ? (
              <div className="space-y-2 text-xs">
                <div className="rounded-sm border border-cyan-500/20 bg-[#061428]/70 p-2">
                  <div className="text-sm font-semibold text-[#90f5ff]">{selectedFlight.callsign}</div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-[#6f9eb8]">
                    {selectedFlight.originCountry}
                  </div>
                </div>
                <KeyValue label="Direction" value={selectedFlight.direction.toUpperCase()} />
                <KeyValue label="Altitude" value={formatAltitudeFeet(selectedFlight.altitude)} />
                <KeyValue label="Speed" value={formatSpeedKmh(selectedFlight.velocity)} />
                <KeyValue
                  label="Track"
                  value={selectedFlight.track !== null ? `${Math.round(selectedFlight.track)}°` : "N/A"}
                />
              </div>
            ) : (
              <div className="text-xs text-[#789cb3]">Select a flight icon on the map to inspect its live vector.</div>
            )}
          </IntelPanel>
        </aside>
      </main>
    </div>
  );
}

function HeaderChip({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <span className={`inline-flex rounded-sm border border-cyan-400/25 bg-[#051728]/70 px-2 py-1 text-[#9ec7df] ${className ?? ""}`}>
      <span className="text-[#5c86a1]">{label}</span> {value}
    </span>
  );
}

function LoadingScreen({ now }: { now: Date }) {
  const [progress, setProgress] = useState(0);
  const [logIndex, setLogIndex] = useState(0);
  const sources = [
    { label: "LTA DataMall", icon: "🚌" },
    { label: "Traffic Cameras", icon: "📷" },
    { label: "Weather Grid", icon: "🌡️" },
    { label: "OSINT Stream", icon: "📡" },
    { label: "Airspace Feed", icon: "✈️" },
  ];
  const bootLogs = [
    "Initializing signal surface...",
    "Mounting LTA DataMall feed...",
    "Establishing camera nodes...",
    "Loading weather grid...",
    "Fetching OSINT stream...",
    "Connecting airspace feed...",
    "Calibrating sensor grid...",
    "System ready.",
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 10 + 2;
      });
    }, 160);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLogIndex((prev) => {
        if (prev >= bootLogs.length - 1) return prev;
        return prev + 1;
      });
    }, 350);
    return () => clearInterval(interval);
  }, [bootLogs.length]);

  const onlineCount = Math.min(
    Math.floor((progress / 100) * sources.length),
    sources.length,
  );

  return (
    <div className="grid h-screen place-items-center overflow-hidden bg-[#020913] px-4 text-terminal-text">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(33,108,156,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(33,108,156,0.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(42,166,255,0.08),transparent_60%)]" />

      <div className="relative w-full max-w-3xl rounded-lg border border-cyan-400/25 bg-[#04111e]/95 p-6 shadow-[0_0_60px_rgba(42,166,255,0.18)] backdrop-blur-sm">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
          <div>
            <div className="[font-family:var(--font-rajdhani)] text-3xl font-semibold uppercase tracking-[0.22em] text-[#e8f5ff]">
              ARGUS MONITOR
              <span
                className="ml-1 inline-block h-5 w-2.5 translate-y-0.5 bg-[#3fd3ff]"
                style={{ animation: "blink 1s step-end infinite" }}
              />
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#6d90a8]">
              Initializing Singapore signal surface
            </div>
          </div>
          <div className="hidden rounded-sm border border-cyan-400/25 bg-[#051728]/70 px-3 py-2 text-right text-[11px] uppercase tracking-[0.14em] text-[#9ec7df] sm:block">
            <div className="text-[#5c86a1]">Boot Time</div>
            <div suppressHydrationWarning>{now.toLocaleTimeString("en-SG")}</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="mb-1.5 flex justify-between text-[10px] uppercase tracking-[0.12em] text-[#6d90a8]">
            <span>System Boot</span>
            <span>{Math.min(Math.round(progress), 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#0a2237]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#35f0ce] via-[#3fb9ff] to-[#6e9dff] shadow-[0_0_12px_rgba(63,185,255,0.5)] transition-all duration-200 ease-out"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {/* Boot log */}
        <div className="mb-4 h-28 overflow-hidden rounded-sm border border-cyan-500/15 bg-[#020b14]/80 p-3 font-mono text-[11px] leading-relaxed">
          {bootLogs.slice(0, logIndex + 1).map((log, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[#3fd3ff]">{'>'}</span>
              <span className={i === logIndex ? "text-[#cfe6f5]" : "text-[#7395a8]"}>
                {log}
              </span>
              {i === logIndex && (
                <span
                  className="ml-0.5 inline-block h-3 w-2 bg-[#cfe6f5]"
                  style={{ animation: "blink 1s step-end infinite" }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Source cards */}
        <div className="grid gap-2 sm:grid-cols-5">
          {sources.map((source, i) => {
            const isOnline = i < onlineCount;
            return (
              <div
                key={source.label}
                className={`rounded-sm border p-3 transition-all duration-500 ${
                  isOnline
                    ? "border-[#35f0ce]/30 bg-[#071629]/70"
                    : "border-cyan-500/20 bg-[#071629]/70"
                }`}
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-1.5 w-8 rounded-full bg-cyan-300/70" />
                  <div
                    className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
                      isOnline ? "bg-[#35f0ce] shadow-[0_0_6px_rgba(53,240,206,0.8)]" : "bg-[#0a2237]"
                    }`}
                    style={{ transitionDelay: `${i * 80}ms` }}
                  />
                </div>
                <div className="text-[11px] uppercase tracking-[0.12em] text-[#cfe6f5]">
                  {source.label}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.1em]">
                  <span className={isOnline ? "text-[#35f0ce]" : "text-[#6d90a8]"}>
                    {isOnline ? "Online" : "Syncing..."}
                  </span>
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
      <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-[0.1em] text-[#8cb2c8]">
        <span>{label}</span>
        <span className="text-cyan-200">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-[#0a2237]">
        <div
          className="h-full rounded bg-gradient-to-r from-[#35f0ce] via-[#3fb9ff] to-[#6e9dff]"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-sm border border-cyan-500/15 bg-[#071629]/65 px-2 py-1.5">
      <span className="text-[11px] uppercase tracking-[0.1em] text-[#7ea4bc]">{label}</span>
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
