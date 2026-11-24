import { useMemo } from "react";
import type { MrtPlansByMode } from "@/app/hooks/use-mrt-planner";
import TerminalPanel from "@/app/components/TerminalPanel";
import {
  isQuieterRoute,
  MRT_STATION_NAMES,
  type MrtRouteMode,
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
  plansByMode?: MrtPlansByMode;
  routeMode?: MrtRouteMode;
  onRouteModeChange?: (mode: MrtRouteMode) => void;
  avoidDisruptions?: boolean;
  onAvoidDisruptionsChange?: (avoid: boolean) => void;
  detourAvailable?: boolean;
  disruptedLines?: ReadonlyArray<string>;
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

const ROUTE_MODE_OPTIONS: ReadonlyArray<{
  readonly value: MrtRouteMode;
  readonly label: string;
  readonly heading: string;
}> = [
  { value: "fastest", label: "Fastest", heading: "Fastest Route Estimate" },
  {
    value: "less-crowded",
    label: "Less crowded",
    heading: "Less Crowded Route",
  },
  {
    value: "fewest-transfers",
    label: "Fewest transfers",
    heading: "Fewest Transfers Route",
  },
];

const TOGGLE_BUTTON_CLASS =
  "inline-flex min-h-7 items-center whitespace-nowrap border px-2 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors duration-150";

const TONE_TEXT = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

const plural = (count: number, one: string) =>
  `${count} ${one}${count === 1 ? "" : "s"}`;

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
  plansByMode,
  routeMode = "fastest",
  onRouteModeChange,
  avoidDisruptions = true,
  onAvoidDisruptionsChange,
  detourAvailable = false,
  disruptedLines = [],
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
  // Only worth saying while a route or picked station could be affected.
  const missingCrowdLines = startStation || endStation ? (trainCrowds?.missingLines ?? []) : [];
  const canSwap = startStation !== endStation;
  const placeholder =
    stationScope && stations.length === 0 ? "No stations in radius" : "Select station";
  const activeModeMeta =
    ROUTE_MODE_OPTIONS.find((option) => option.value === routeMode) ??
    ROUTE_MODE_OPTIONS[0];
  const fastestPlan = plansByMode?.fastest ?? null;
  const lessCrowdedPlan = plansByMode?.["less-crowded"] ?? null;
  const quieterAlternative =
    routeMode === "fastest" &&
    route &&
    isQuieterRoute(lessCrowdedPlan, route)
      ? lessCrowdedPlan
      : null;
  const extraVsFastest =
    route &&
    fastestPlan &&
    routeMode !== "fastest" &&
    route.estimatedMinutes > fastestPlan.estimatedMinutes
      ? route.estimatedMinutes - fastestPlan.estimatedMinutes
      : 0;

  return (
    <TerminalPanel title="MRT ROUTER" contentClassName="min-h-44 sm:min-h-56">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="data-label space-y-1">
            <span>Start</span>
            <select
              value={startStation}
              onChange={(event) => onStartChange(event.target.value)}
              className="field-control text-base normal-case tracking-normal sm:text-xs"
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
              className="field-control text-base normal-case tracking-normal sm:text-xs"
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

        {hasCrowds && missingCrowdLines.length > 0 ? (
          <div className="text-[11px] text-muted">
            No crowd readings for the {missingCrowdLines.join(", ")} right now.
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

        {onRouteModeChange || onAvoidDisruptionsChange ? (
          <div className="data-row space-y-2 p-2.5 text-[11px]">
            {onRouteModeChange ? (
              <div>
                <div className="data-label mb-1.5">Routing Priority</div>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Routing priority">
                  {ROUTE_MODE_OPTIONS.map((option) => {
                    const active = routeMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => onRouteModeChange(option.value)}
                        aria-pressed={active}
                        className={`${TOGGLE_BUTTON_CLASS} ${
                          active
                            ? "border-ink bg-ink text-paper"
                            : "border-line text-muted hover:border-line-strong hover:text-ink"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                {routeMode === "less-crowded" && (startStation || endStation) && !hasCrowds ? (
                  <div className="mt-1.5 text-[10px] text-muted">
                    Live crowd readings unavailable — using fastest route.
                  </div>
                ) : null}
              </div>
            ) : null}

            {onAvoidDisruptionsChange ? (
              <div className="flex items-center justify-between gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <div className="text-[11px] text-ink">Avoid disruptions</div>
                  {disruptedLines.length > 0 ? (
                    <div className="truncate font-mono text-[10px] text-danger">
                      Active: {disruptedLines.join(", ")}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => onAvoidDisruptionsChange(!avoidDisruptions)}
                  aria-pressed={avoidDisruptions}
                  className={`${TOGGLE_BUTTON_CLASS} ${
                    avoidDisruptions
                      ? "border-ink bg-ink text-paper"
                      : "border-line text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {avoidDisruptions ? "On" : "Off"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

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
            Tap or click an MRT station on the map to set {mapPickTarget.toUpperCase()}.
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
            {route.detouredForDisruption ? (
              <div
                role="status"
                className="space-y-1.5 border border-warning/50 bg-warning/8 p-2.5 text-[11px] text-warning"
              >
                <div>
                  Rerouted around{" "}
                  {route.avoidedDisruptedLines.length > 0
                    ? route.avoidedDisruptedLines.join(", ")
                    : "active disruption"}
                  {route.extraMinutesVsNormal > 0
                    ? ` (+${route.extraMinutesVsNormal} min vs normal)`
                    : " (same travel time)"}
                  .
                </div>
                {onAvoidDisruptionsChange ? (
                  <button
                    type="button"
                    onClick={() => onAvoidDisruptionsChange(false)}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] underline decoration-warning/50 underline-offset-2 hover:decoration-warning"
                  >
                    Show normal route
                  </button>
                ) : null}
              </div>
            ) : null}

            {route.disruption.lines.length > 0 ? (
              <div
                role="status"
                className="space-y-1.5 border border-danger/50 bg-danger/8 p-2.5 text-[11px] text-danger"
              >
                <div>
                  Route crosses disrupted {route.disruption.lines.join(", ")}
                  {route.disruption.stations.length > 0 &&
                  route.disruption.stations.length <= 4
                    ? ` (${route.disruption.stations.join(", ")})`
                    : ""}
                  .
                </div>
                {route.disruptionUnavoidable ? (
                  <div className="text-[10px] text-muted">
                    No alternative rail route avoids this disruption.
                  </div>
                ) : detourAvailable && onAvoidDisruptionsChange ? (
                  <button
                    type="button"
                    onClick={() => onAvoidDisruptionsChange(true)}
                    className="font-mono text-[10px] uppercase tracking-[0.08em] underline decoration-danger/50 underline-offset-2 hover:decoration-danger"
                  >
                    Reroute around disruption
                  </button>
                ) : null}
              </div>
            ) : null}

            {quieterAlternative && onRouteModeChange ? (
              <button
                type="button"
                onClick={() => onRouteModeChange("less-crowded")}
                className="flex w-full items-center justify-between gap-2 border border-info/45 bg-info/8 px-2.5 py-2 text-left text-[11px] text-info transition-colors duration-150 hover:bg-info/12"
              >
                <span>
                  Quieter route: {quieterAlternative.estimatedMinutes} min
                  {quieterAlternative.estimatedMinutes > route.estimatedMinutes
                    ? ` (+${quieterAlternative.estimatedMinutes - route.estimatedMinutes} min)`
                    : ""}
                  {quieterAlternative.crowd.peak
                    ? ` · peak ${CROWD_LEVEL_LABEL[quieterAlternative.crowd.peak]}`
                    : ""}
                </span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em]">
                  Switch →
                </span>
              </button>
            ) : null}

            <div className="border border-line bg-paper p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="data-label">{activeModeMeta.heading}</span>
                {extraVsFastest > 0 ? (
                  <span className="font-mono text-[10px] text-muted">
                    +{extraVsFastest} min vs fastest
                  </span>
                ) : null}
              </div>
              <div className="mt-1 font-mono text-sm text-ink">
                {route.estimatedMinutes} min ·{" "}
                {plural(Math.max(0, route.stations.length - 1), "stop")} ·{" "}
                {plural(route.transfers, "transfer")}
              </div>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[11px] text-muted">
                <span>
                  {route.start} → {route.end}
                </span>
                {hasCrowds && route.crowd.peak ? (
                  <span className="font-mono text-[10px]">
                    Peak: <CrowdText level={route.crowd.peak} />
                  </span>
                ) : null}
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
                      className={`border px-2.5 py-2 ${
                        segment.disrupted
                          ? "border-danger/60 bg-danger/8"
                          : "border-line bg-surface"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={`data-label ${
                            segment.disrupted ? "text-danger" : "text-success"
                          }`}
                        >
                          {segment.line}
                        </div>
                        {segment.disrupted ? (
                          <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-danger">
                            Disrupted
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[12px] text-ink">
                        {segment.from} → {segment.to}
                      </div>
                      <div className="text-[11px] text-muted">
                        {plural(segment.stops, "stop")}
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