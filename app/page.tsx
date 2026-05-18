"use client";

import { useEffect, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import Map from "@/app/components/Map";
import NewsPanel from "@/app/components/NewsPanel";
import WeatherPanel from "@/app/components/WeatherPanel";
import type { BusStop, NewsItem, TrafficCamera, WeatherData } from "@/types";

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
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [selectedCamera, setSelectedCamera] = useState<TrafficCamera | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      fetch("/api/bus-stops"),
      fetch("/api/cameras"),
      fetch("/api/weather"),
      fetch("/api/news"),
    ])
      .then(async ([busStopsRes, camerasRes, weatherRes, newsRes]) => {
        if (!busStopsRes.ok || !camerasRes.ok || !weatherRes.ok || !newsRes.ok) {
          throw new Error("Failed to load initial dashboard data");
        }

        const [busStopsData, camerasData, weatherData, newsData] = await Promise.all([
          busStopsRes.json() as Promise<BusStop[]>,
          camerasRes.json() as Promise<TrafficCamera[]>,
          weatherRes.json() as Promise<WeatherData>,
          newsRes.json() as Promise<NewsItem[]>,
        ]);

        if (!mounted) return;
        setBusStops(busStopsData);
        setCameras(camerasData);
        setWeather(weatherData);
        setNews(newsData);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unknown dashboard error");
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

    return () => {
      clearInterval(weatherTimer);
      clearInterval(newsTimer);
      clearInterval(camerasTimer);
    };
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden px-3 py-3">
      <header className="terminal-panel mb-3">
        <div className="terminal-header justify-between">
          <span>
            <span className="terminal-cyan">ARGUS</span> | SG DAILY OSINT TERMINAL
          </span>
          <span className="terminal-dim text-[11px]" suppressHydrationWarning>{new Date().toLocaleString()}</span>
        </div>
      </header>

      {error ? <div className="terminal-red mb-2 text-sm">{error}</div> : null}

      <main className="grid flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[3fr_2fr]">
        <section className="terminal-panel min-h-[320px] overflow-hidden">
          <Map
            busStops={busStops}
            cameras={cameras}
            onStopClick={setSelectedStop}
            onCameraClick={setSelectedCamera}
          />
        </section>

        <section className="grid min-h-0 auto-rows-min gap-3 overflow-auto pr-1">
          <WeatherPanel weather={weather} />
          <BusPanel busStops={busStops} selectedStop={selectedStop} onSelectStop={setSelectedStop} />
          <NewsPanel news={news} />
          <CameraPanel cameras={cameras} selectedCamera={selectedCamera} />
        </section>
      </main>
    </div>
  );
}
