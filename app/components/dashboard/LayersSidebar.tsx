"use client";

import type { Dispatch, SetStateAction } from "react";
import FlightPanel from "@/app/components/FlightPanel";
import WeatherPanel from "@/app/components/WeatherPanel";
import { IntelPanel } from "@/app/components/dashboard/IntelPanel";
import type {
  SensorKey,
  SensorRow,
  SensorStatsRow,
} from "@/app/hooks/use-dashboard-state";
import type {
  FlightState,
  WeatherData,
  WeatherHistoryPoint,
} from "@/types";

export function LayersSidebar({
  flights,
  selectedFlight,
  sensorRows,
  sensorStatsRows,
  sensorVisibility,
  setSelectedFlight,
  setSensorVisibility,
  visibleSensorCount,
  weather,
  weatherHistory,
}: {
  flights: FlightState[];
  selectedFlight: FlightState | null;
  sensorRows: ReadonlyArray<SensorRow>;
  sensorStatsRows: ReadonlyArray<SensorStatsRow>;
  sensorVisibility: Record<SensorKey, boolean>;
  setSelectedFlight: (flight: FlightState) => void;
  setSensorVisibility: Dispatch<SetStateAction<Record<SensorKey, boolean>>>;
  visibleSensorCount: number;
  weather: WeatherData;
  weatherHistory: WeatherHistoryPoint[];
}) {
  return (
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
                <div className="data-label truncate">{row.note}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSensorVisibility((previous) => ({
                      ...previous,
                      [row.key]: !previous[row.key],
                    }))
                  }
                  aria-label={`${sensorVisibility[row.key] ? "Hide" : "Show"} ${row.label}`}
                  title={`${sensorVisibility[row.key] ? "Hide" : "Show"} ${row.label}`}
                  aria-pressed={sensorVisibility[row.key]}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-150 ${
                    sensorVisibility[row.key]
                      ? "border-success/45 bg-success/8 text-success hover:bg-success/12"
                      : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {sensorVisibility[row.key] ? (
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-3 w-3"
                      aria-hidden="true"
                    >
                      <path d="M1.5 8s2.25-4 6.5-4 6.5 4 6.5 4-2.25 4-6.5 4S1.5 8 1.5 8Z" />
                      <circle cx="8" cy="8" r="1.75" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="h-3 w-3"
                      aria-hidden="true"
                    >
                      <path d="M2 2l12 12M6.4 4.2A7.5 7.5 0 0 1 8 4c4.25 0 6.5 4 6.5 4a8.7 8.7 0 0 1-2 2.45M9.6 11.8A7.5 7.5 0 0 1 8 12c-4.25 0-6.5-4-6.5-4a8.7 8.7 0 0 1 2-2.45" />
                    </svg>
                  )}
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
                <div className="data-label truncate">{row.note}</div>
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
  );
}
