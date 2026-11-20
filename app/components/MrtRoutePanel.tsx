import { useMemo } from "react";
import TerminalPanel from "@/app/components/TerminalPanel";
import {
  MRT_STATION_NAMES,
  type MrtRoutePlan,
} from "@/lib/mrt-routing";
import {
  busiestOnLine,
  CROWD_LEVEL_LABEL,
  CROWD_LEVEL_TONE,
  crowdOnLine,
} from "@/lib/train-crowds";
import type { CrowdLevel, StationCrowd, TrainCrowds } from "@/types";

type MrtRoutePanelProps = {
  route: MrtRoutePlan | null;
  startStation: string;
  endStation: string;
  onStartChange: (station: string) => void;
  onEndChange: (station: string) => void;
  mapPickTarget: "start" | "end";
  onMapPickTargetChange: (target: "start" | "end") => void;
  onReset: () => void;
  /** Stations offered in the start/end lists. Defaults to every station. */
  stations?: ReadonlyArray<string>;
  /** Set while a radius filter limits `stations`, e.g. "2.5 km radius". */
  stationScope?: string;
  /** LTA platform crowd levels for the picked stations and the route. */
  trainCrowds?: TrainCrowds;
};

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

function CrowdText({ level }: { level: CrowdLevel }) {
  return <span className={TONE_TEXT[CROWD_LEVEL_TONE[level]]}>{CROWD_LEVEL_LABEL[level]}</span>;
}

/** Platform crowd for a picked station; interchanges list each line on hover. */
function StationCrowdLine({ crowd }: { crowd: StationCrowd | undefined }) {
  if (!crowd) return <span className="text-muted">Crowd: no reading</span>;
  const perLine = crowd.lines.length > 1
    ? crowd.lines.map((line) => `${line.code} ${CROWD_LEVEL_LABEL[line.level]}`).join(", ")
    : undefined;
  return (
    <span title={perLine}>
      <span className="text-muted">Crowd: </span>
      <CrowdText level={crowd.level} />
      {perLine ? <span className="text-muted"> · {crowd.lines.length} lines</span> : null}
    </span>
  );
}

/** Keep selected stations listed even when outside the current scope. */
function stationOptions(
  stations: ReadonlyArray<string>,
  selected: string,
): Array<{ station: string; outside: boolean }> {
  const options = stations.map((station) => ({ station, outside: false }));
  if (selected && !stations.includes(selected)) {
    options.unshift({ station: selected, outside: true });
  }
  return options;
}

export default function MrtRoutePanel({
  route,
  startStation,
  endStation,
  onStartChange,
  onEndChange,
  mapPickTarget,
  onMapPickTargetChange,
  onReset,
  stations = MRT_STATION_NAMES,
  stationScope,
  trainCrowds,
}: MrtRoutePanelProps) {
  const crowds = useMemo(
    () => new Map((trainCrowds?.stations ?? []).map((crowd) => [crowd.station, crowd])),
    [trainCrowds],
  );
  const hasCrowds = crowds.size > 0;
  const canSwap = startStation !== endStation;
  const placeholder =
    stationScope && stations.length === 0 ? "No stations in radius" : "Select station";

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
              <option value="">{placeholder}</option>
              {stationOptions(stations, startStation).map(({ station, outside }) => (
                <option key={`start-${station}`} value={station}>
                  {outside ? `${station} (outside radius)` : station}
                </option>
              ))}
            </select>
            {startStation && hasCrowds ? (
              <span className="block font-mono text-[10px] normal-case tracking-normal">
                <StationCrowdLine crowd={crowds.get(startStation)} />
              </span>
            ) : null}
          </label>
          <label className="data-label space-y-1">
            <span>End</span>
            <select
              value={endStation}
              onChange={(event) => onEndChange(event.target.value)}
              className="field-control text-xs normal-case tracking-normal"
            >
              <option value="">{placeholder}</option>
              {stationOptions(stations, endStation).map(({ station, outside }) => (
                <option key={`end-${station}`} value={station}>
                  {outside ? `${station} (outside radius)` : station}
                </option>
              ))}
            </select>
            {endStation && hasCrowds ? (
              <span className="block font-mono text-[10px] normal-case tracking-normal">
                <StationCrowdLine crowd={crowds.get(endStation)} />
              </span>
            ) : null}
          </label>
        </div>

        {stationScope ? (
          <div className="text-[11px] text-muted">
            {stations.length === 0
              ? `No MRT stations within the ${stationScope}. Widen or clear the radius filter to plan a route.`
              : `${stations.length} station${stations.length === 1 ? "" : "s"} within the ${stationScope}.`}
          </div>
        ) : null}

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
                route.segments.map((segment) => {
                  const boarding = crowdOnLine(crowds.get(segment.from), segment.line);
                  // Stops after boarding; the alighting platform counts too.
                  const busiest = busiestOnLine(segment.stations.slice(1), segment.line, crowds);
                  return (
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
                      {hasCrowds ? (
                        <div className="mt-1 font-mono text-[10px] text-muted">
                          Board: {boarding ? <CrowdText level={boarding} /> : "no reading"}
                          {busiest && busiest.level !== "low" ? (
                            <>
                              {" · Busiest: "}
                              {busiest.station} <CrowdText level={busiest.level} />
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })
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
