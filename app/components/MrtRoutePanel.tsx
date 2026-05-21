"use client";

import { useMemo } from "react";
import TerminalPanel from "@/app/components/TerminalPanel";
import { MRT_STATION_NAMES, planMrtRoute } from "@/lib/mrt-routing";

const DEFAULT_START = "";
const DEFAULT_END = "";

type MrtRoutePanelProps = {
  startStation: string;
  endStation: string;
  onStartChange: (station: string) => void;
  onEndChange: (station: string) => void;
  mapPickTarget: "start" | "end";
  onMapPickTargetChange: (target: "start" | "end") => void;
  onReset: () => void;
};

export const MRT_ROUTE_DEFAULTS = {
  start: DEFAULT_START,
  end: DEFAULT_END,
};

export default function MrtRoutePanel({
  startStation,
  endStation,
  onStartChange,
  onEndChange,
  mapPickTarget,
  onMapPickTargetChange,
  onReset,
}: MrtRoutePanelProps) {
  const route = useMemo(
    () => (startStation && endStation ? planMrtRoute(startStation, endStation) : null),
    [startStation, endStation],
  );

  const canSwap = startStation !== endStation;

  return (
    <TerminalPanel title="MRT ROUTER" contentClassName="min-h-44 sm:min-h-56">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-[11px] uppercase tracking-[0.1em] text-[#79a3bd]">
            <span>Start</span>
            <select
              value={startStation}
              onChange={(event) => onStartChange(event.target.value)}
              className="w-full rounded-md border border-terminal-border bg-black/20 px-2 py-1 text-[12px] text-terminal-text outline-none focus:border-terminal-cyan"
            >
              <option value="">Select station</option>
              {MRT_STATION_NAMES.map((station) => (
                <option key={`start-${station}`} value={station}>
                  {station}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-[11px] uppercase tracking-[0.1em] text-[#79a3bd]">
            <span>End</span>
            <select
              value={endStation}
              onChange={(event) => onEndChange(event.target.value)}
              className="w-full rounded-md border border-terminal-border bg-black/20 px-2 py-1 text-[12px] text-terminal-text outline-none focus:border-terminal-cyan"
            >
              <option value="">Select station</option>
              {MRT_STATION_NAMES.map((station) => (
                <option key={`end-${station}`} value={station}>
                  {station}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSwap}
            onClick={() => {
              const previousStart = startStation;
              onStartChange(endStation);
              onEndChange(previousStart);
            }}
            className="rounded border border-terminal-border px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-[#9ac4dd] transition hover:border-terminal-cyan hover:text-terminal-cyan disabled:cursor-not-allowed disabled:opacity-50"
          >
            Swap Direction
          </button>
          <button
            type="button"
            onClick={onReset}
            className="rounded border border-red-400/50 px-2 py-1 text-[11px] uppercase tracking-[0.1em] text-red-200 transition hover:border-red-300 hover:text-red-100"
          >
            Reset Route
          </button>
        </div>

        <div className="rounded border border-terminal-border/60 bg-black/20 p-2 text-[11px]">
          <div className="mb-2 uppercase tracking-[0.1em] text-[#79a3bd]">Map Click Target</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onMapPickTargetChange("start")}
              className={`rounded border px-2 py-1 uppercase tracking-[0.08em] ${
                mapPickTarget === "start"
                  ? "border-terminal-cyan bg-terminal-cyan/20 text-terminal-cyan"
                  : "border-terminal-border text-[#9ac4dd]"
              }`}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => onMapPickTargetChange("end")}
              className={`rounded border px-2 py-1 uppercase tracking-[0.08em] ${
                mapPickTarget === "end"
                  ? "border-terminal-cyan bg-terminal-cyan/20 text-terminal-cyan"
                  : "border-terminal-border text-[#9ac4dd]"
              }`}
            >
              End
            </button>
          </div>
          <div className="mt-2 text-[#7ea4bc]">
            Click an MRT station on the map to set {mapPickTarget.toUpperCase()}.
          </div>
        </div>

        {!startStation || !endStation ? (
          <div className="terminal-dim text-[12px]">Select start and end stations to calculate a route.</div>
        ) : !route ? (
          <div className="terminal-red text-[12px]">No MRT route found for this station pair.</div>
        ) : (
          <div className="space-y-2">
            <div className="rounded border border-terminal-border/60 bg-black/20 p-2">
              <div className="terminal-cyan text-xs uppercase tracking-[0.11em]">Fastest Route Estimate</div>
              <div className="mt-1 text-sm text-[#d8ecf8]">
                {route.estimatedMinutes} min · {Math.max(0, route.stations.length - 1)} stops · {route.transfers} transfers
              </div>
              <div className="mt-1 text-[11px] text-[#7ea4bc]">
                {route.start} → {route.end}
              </div>
            </div>

            <div className="space-y-1">
              {route.segments.length > 0 ? (
                route.segments.map((segment, index) => (
                  <div
                    key={`${segment.line}-${segment.from}-${segment.to}-${index}`}
                    className="rounded border border-terminal-border/50 bg-black/15 px-2 py-1.5"
                  >
                    <div className="terminal-green text-[11px] uppercase tracking-[0.1em]">{segment.line}</div>
                    <div className="text-[12px] text-[#d8ecf8]">
                      {segment.from} → {segment.to}
                    </div>
                    <div className="text-[11px] text-[#789cb3]">{segment.stops} stops</div>
                  </div>
                ))
              ) : (
                <div className="rounded border border-terminal-border/50 bg-black/15 px-2 py-1.5 text-[12px] text-[#d8ecf8]">
                  You are already at {route.start}.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </TerminalPanel>
  );
}
