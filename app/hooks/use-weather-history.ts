"use client";

import { useEffect, useState } from "react";
import {
  mergePointLists,
  readPointList,
  writePointList,
} from "@/lib/local-history";
import type { WeatherData, WeatherHistoryPoint } from "@/types";

const STORAGE_KEY = "argus.weather.history.v1";
const MAX_POINTS = 288; // 24 hours at a five-minute cadence

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
        // Merge storage again at write time. This makes the operation safe
        // even if a cached data callback beats the hydration timer.
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
