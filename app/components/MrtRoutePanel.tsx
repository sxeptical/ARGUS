import { useMemo } from "react";
import TerminalPanel from "@/app/components/TerminalPanel";
import { MRT_STATION_NAMES, planMrtRoute } from "@/lib/mrt-routing";

type MrtRoutePanelProps = {
  startStation: string;
  endStation: string;
  onStartChange: (station: string) => void;
  onEndChange: (station: string) => void;
  mapPickTarget: "start" | "end";
  onMapPickTargetChange: (target: "start" | "end") => void;
  onReset: () => void;
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
    () =>
      startStation && endStation
        ? planMrtRoute(startStation, endStation)
        : null,
    [startStation, endStation],
  );

  const canSwap = startStation !== endStation;

  return (
    <TerminalPanel title="MRT ROUTER" contentClassName="min-h-44 sm:min-h-56">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="data-label space-y-1">
            <span>Start</span>
            <select
              value={startStation}
              onChange={(event) => onStartChange(event.target.value)}
              className="field-control text-xs normal-case tracking-normal"
            >
              <option value="">Select station</option>
              {MRT_STATION_NAMES.map((station) => (
                <option key={`start-${station}`} value={station}>
                  {station}
                </option>
              ))}
            </select>
          </label>
          <label className="data-label space-y-1">
            <span>End</span>
            <select
              value={endStation}
              onChange={(event) => onEndChange(event.target.value)}
              className="field-control text-xs normal-case tracking-normal"
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
            className="action-button"
          >
            Swap Direction
          </button>
          <button
            type="button"
            onClick={onReset}
            className="action-button border-danger/50 text-danger hover:border-danger hover:text-danger"
          >
            Reset Route
          </button>
        </div>

        <div className="data-row p-2.5 text-[11px]">
          <div className="data-label mb-2">
            Map Click Target
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onMapPickTargetChange("start")}
              aria-pressed={mapPickTarget === "start"}
              className={`inline-flex min-h-7 items-center whitespace-nowrap border px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 ${
                mapPickTarget === "start"
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => onMapPickTargetChange("end")}
              aria-pressed={mapPickTarget === "end"}
              className={`inline-flex min-h-7 items-center whitespace-nowrap border px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 ${
                mapPickTarget === "end"
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              End
            </button>
          </div>
          <div className="mt-2 text-muted">
            Click an MRT station on the map to set {mapPickTarget.toUpperCase()}.
          </div>
        </div>

        {!startStation || !endStation ? (
          <div className="text-[12px] text-muted">
            Select start and end stations to calculate a route.
          </div>
        ) : !route ? (
          <div className="text-[12px] text-danger">
            No MRT route found for this station pair.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="border border-line bg-paper p-2.5">
              <div className="data-label">
                Fastest Route Estimate
              </div>
              <div className="mt-1 font-mono text-sm text-ink">
                {route.estimatedMinutes} min ·{" "}
                {Math.max(0, route.stations.length - 1)} stops ·{" "}
                {route.transfers} transfers
              </div>
              <div className="mt-1 text-[11px] text-muted">
                {route.start} → {route.end}
              </div>
            </div>

            <div className="space-y-1">
              {route.segments.length > 0 ? (
                route.segments.map((segment) => (
                  <div
                    key={`${segment.line}-${segment.from}-${segment.to}`}
                    className="border border-line bg-surface px-2.5 py-2"
                  >
                    <div className="data-label text-success">
                      {segment.line}
                    </div>
                    <div className="text-[12px] text-ink">
                      {segment.from} → {segment.to}
                    </div>
                    <div className="text-[11px] text-muted">
                      {segment.stops} stops
                    </div>
                  </div>
                ))
              ) : (
                <div className="border border-line bg-surface px-2.5 py-2 text-[12px] text-ink">
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
