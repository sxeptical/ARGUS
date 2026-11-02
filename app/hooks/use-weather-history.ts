"use client";

import { useEffect, useState } from "react";
import {
  mergePointLists,
  readPointList,
  writePointList,
} from "@/lib/local-history";
import type { WeatherData, WeatherHistoryPoint } from "@/types";

// v3: back on NEA PSI; a new key keeps the interim US AQI samples (v2) out
// of the PSI trend.
const STORAGE_KEY = "argus.weather.history.v3";
const MAX_POINTS = 288; // 24 hours at five-minute intervals

function isWeatherHistoryPoint(value: unknown): value is WeatherHistoryPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Partial<WeatherHistoryPoint>;
  if (
    typeof point.timestamp !== "string" ||
    !Number.isFinite(Date.parse(point.timestamp))
  ) {
    return false;
  }
  return [point.temperature, point.humidity, point.psi].every(
    (reading) => reading === null || Number.isFinite(reading),
  );
}

function recordWeather(
  history: readonly WeatherHistoryPoint[],
  weather: WeatherData,
): WeatherHistoryPoint[] {
  if (
    weather.temperature === null &&
    weather.humidity === null &&
    weather.psi === null
  ) {
    return [...history];
  }
  return mergePointLists(history, [
    {
      timestamp: weather.lastUpdated,
      temperature: weather.temperature,
      humidity: weather.humidity,
      psi: weather.psi,
    },
  ]).slice(-MAX_POINTS);
}

export function useWeatherHistory(weather: WeatherData) {
  const [history, setHistory] = useState<WeatherHistoryPoint[]>([]);

  // Merge hydration with any point already recorded; never replace state.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistory((current) => {
        const persisted = readPointList(
          STORAGE_KEY,
          isWeatherHistoryPoint,
          MAX_POINTS,
        );
        const merged = mergePointLists(persisted, current).slice(-MAX_POINTS);
        writePointList(STORAGE_KEY, merged, MAX_POINTS);
        return merged;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHistory((current) => {
        // Preserve points recorded before storage hydration completes.
        const persisted = readPointList(
          STORAGE_KEY,
          isWeatherHistoryPoint,
          MAX_POINTS,
        );
        const next = recordWeather(
          mergePointLists(persisted, current),
          weather,
        );
        if (
          next.length === current.length &&
          next.every((point, index) => point === current[index])
        ) {
          return current;
        }
        writePointList(STORAGE_KEY, next, MAX_POINTS);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [weather]);

  return history;
}
