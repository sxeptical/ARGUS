"use client";

import { useEffect, useMemo, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import FlightPanel from "@/app/components/FlightPanel";
import Map from "@/app/components/Map";
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

export default function Home() {
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [cameras, setCameras] = useState<TrafficCamera[]>([]);
  const [weather, setWeather] = useState<WeatherData>(DEFAULT_WEATHER);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [flights, setFlights] = useState<FlightState[]>([]);
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<TrafficCamera | null>(null);
  const [selectedFlight, setSelectedFlight] = useState<FlightState | null>(null);
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

      if (busStopsRes.status === "fulfilled" && busStopsRes.value.ok) {
        setBusStops((await busStopsRes.value.json()) as BusStop[]);
      } else {
        errors.push("bus stops");
      }

      if (camerasRes.status === "fulfilled" && camerasRes.value.ok) {
        setCameras((await camerasRes.value.json()) as TrafficCamera[]);
      } else {
        errors.push("cameras");
      }

      if (weatherRes.status === "fulfilled" && weatherRes.value.ok) {
        setWeather((await weatherRes.value.json()) as WeatherData);
      } else {
        errors.push("weather");
      }

      if (newsRes.status === "fulfilled" && newsRes.value.ok) {
        setNews((await newsRes.value.json()) as NewsItem[]);
      } else {
        errors.push("news");
      }

      if (flightsRes.status === "fulfilled" && flightsRes.value.ok) {
        setFlights((await flightsRes.value.json()) as FlightState[]);
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
    const weatherTimer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/weather");
          if (response.ok) {
            setWeather((await response.json()) as WeatherData);
          }
        } catch {
          // Silently retry on next interval
        }
      })();
    }, 5 * 60 * 1000);

    const newsTimer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/news");
          if (response.ok) {
            setNews((await response.json()) as NewsItem[]);
          }
        } catch {
          // Silently retry on next interval
        }
      })();
    }, 15 * 60 * 1000);

    const camerasTimer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/cameras");
          if (response.ok) {
            setCameras((await response.json()) as TrafficCamera[]);
          }
        } catch {
          // Silently retry on next interval
        }
      })();
    }, 60 * 1000);

    const flightsTimer = setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/flights");
          if (response.ok) {
            setFlights((await response.json()) as FlightState[]);
          }
        } catch {
          // Silently retry on next interval
        }
      })();
    }, 20 * 1000);

    const clockTimer = setInterval(() => setNow(new Date()), 1000);

    return () => {
      clearInterval(weatherTimer);
      clearInterval(newsTimer);
      clearInterval(camerasTimer);
      clearInterval(flightsTimer);
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
      value: 2,
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
    <div className="flex h-screen flex-col gap-3 overflow-hidden px-3 py-2">
      <header className="rounded-md border border-cyan-400/25 bg-[#04111e]/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_24px_rgba(42,166,255,0.12)]">
        <div className="flex items-center justify-between gap-3 overflow-auto px-3 py-2">
          <div className="flex items-center gap-3 whitespace-nowrap">
            <div className="[font-family:var(--font-rajdhani)] text-2xl font-semibold uppercase tracking-[0.2em] text-[#e8f5ff]">
              Argus Monitor
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em]">
            <HeaderChip label="Visuals" value="Full" />
            <HeaderChip label="Sweep" value="30.1s" />
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

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
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

        <section className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(240px,38%)] gap-3">
          <section className="relative min-h-0 overflow-hidden rounded-md border border-cyan-400/25 bg-[#04101a] shadow-[0_0_28px_rgba(18,149,226,0.14)]">
            <Map
              busStops={busStops}
              cameras={cameras}
              flights={flights}
              sensorVisibility={sensorVisibility}
              onStopClick={setSelectedStop}
              onCameraClick={setSelectedCamera}
              onFlightClick={setSelectedFlight}
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

          <section className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
            <div className="min-h-0 overflow-auto">
              <BusPanel busStops={busStops} selectedStop={selectedStop} onSelectStop={setSelectedStop} />
            </div>
            <div className="min-h-0 overflow-auto">
              <NewsPanel news={news} />
            </div>
            <div className="min-h-0 overflow-auto xl:col-span-2 2xl:col-span-1">
              <CameraPanel cameras={cameras} selectedCamera={selectedCamera} />
            </div>
          </section>
        </section>

        <aside className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
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

function HeaderChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-sm border border-cyan-400/25 bg-[#051728]/70 px-2 py-1 text-[#9ec7df]">
      <span className="text-[#5c86a1]">{label}</span> {value}
    </span>
  );
}

function LoadingScreen({ now }: { now: Date }) {
  const sources = ["LTA DataMall", "Traffic Cameras", "Weather Grid", "OSINT Stream", "Airspace Feed"];

  return (
    <div className="grid h-screen place-items-center overflow-hidden bg-[#020913] px-4 text-terminal-text">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(33,108,156,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(33,108,156,0.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
      <div className="relative w-full max-w-3xl rounded-md border border-cyan-400/25 bg-[#04111e]/95 p-5 shadow-[0_0_44px_rgba(42,166,255,0.16)]">
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-cyan-500/20 pb-4">
          <div>
            <div className="[font-family:var(--font-rajdhani)] text-3xl font-semibold uppercase tracking-[0.22em] text-[#e8f5ff]">
              ARGUS MONITOR
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-[#6d90a8]">
              Initializing Singapore signal surface
            </div>
          </div>
          <div className="hidden rounded-sm border border-cyan-400/25 bg-[#051728]/70 px-3 py-2 text-right text-[11px] uppercase tracking-[0.14em] text-[#9ec7df] sm:block">
            <div className="text-[#5c86a1]">Boot Time</div>
            <div>{now.toLocaleTimeString("en-SG")}</div>
          </div>
        </div>

        <div className="mb-5 h-1.5 overflow-hidden rounded bg-[#0a2237]">
          <div className="h-full w-2/3 animate-pulse rounded bg-gradient-to-r from-[#35f0ce] via-[#3fb9ff] to-[#6e9dff]" />
        </div>

        <div className="grid gap-2 sm:grid-cols-5">
          {sources.map((source) => (
            <div key={source} className="rounded-sm border border-cyan-500/20 bg-[#071629]/70 p-3">
              <div className="mb-3 h-1.5 w-10 rounded bg-cyan-300/70" />
              <div className="text-[11px] uppercase tracking-[0.12em] text-[#cfe6f5]">{source}</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[#6d90a8]">Syncing</div>
            </div>
          ))}
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
