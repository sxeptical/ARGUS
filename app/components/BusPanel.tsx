import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import TerminalPanel from "@/app/components/TerminalPanel";
import {
  IDLE_BUS_ROUTE_STATE,
  type BusRouteUiState,
} from "@/app/hooks/use-bus-route";
import { apiFetch } from "@/lib/api-fetch";
import {
  mergePointStores,
  readPointStore,
  writePointStore,
} from "@/lib/local-history";
import type { BusArrival, BusRouteDirection, BusStop } from "@/types";

type BusPanelProps = {
  busStops: BusStop[];
  selectedStop: BusStop | null;
  onSelectStop?: (stop: BusStop) => void;
  routeState?: BusRouteUiState;
  onShowRoute?: (serviceNo: string) => void;
  onClearRoute?: () => void;
  onSelectRouteDirection?: (direction: number) => void;
};

type BusArrivalHistoryPoint = {
  timestamp: string;
  nextMinutes: number | null;
  secondMinutes: number | null;
  thirdMinutes: number | null;
};

type BusArrivalHistoryStore = Record<
  string,
  ReadonlyArray<BusArrivalHistoryPoint>
>;

const BUS_ARRIVAL_HISTORY_STORAGE_KEY = "argus.bus-arrival-history.v1";
const BUS_ARRIVAL_HISTORY_SAMPLE_MS = 5 * 60 * 1000;
const BUS_ARRIVAL_HISTORY_MAX_POINTS_PER_SERVICE = 288;
const BUS_ARRIVAL_HISTORY_MAX_SERVICES = 40;
const BUS_ARRIVAL_REFRESH_MS = 15 * 1000;
const EMPTY_BUS_ARRIVALS: BusArrival[] = [];

function getArrivalHistoryKey(stopCode: string, serviceNo: string): string {
  return `${stopCode}:${serviceNo}`;
}

function isBusArrivalHistoryPoint(
  value: unknown,
): value is BusArrivalHistoryPoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.timestamp !== "string") return false;
  const ts = Date.parse(candidate.timestamp);
  if (!Number.isFinite(ts)) return false;
  for (const key of ["nextMinutes", "secondMinutes", "thirdMinutes"] as const) {
    const v = candidate[key];
    if (v !== null && typeof v !== "number") return false;
    if (typeof v === "number" && !Number.isFinite(v)) return false;
  }
  return true;
}

function minutesUntil(iso?: string, now = Date.now()): number | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((timestamp - now) / 60_000));
}

function appendBusArrivalHistory(
  history: BusArrivalHistoryStore,
  stopCode: string,
  arrivals: ReadonlyArray<BusArrival>,
): BusArrivalHistoryStore {
  const now = Date.now();
  let changed = false;
  const next: BusArrivalHistoryStore = { ...history };

  for (const service of arrivals) {
    const key = getArrivalHistoryKey(stopCode, service.ServiceNo);
    const existing = next[key] ?? [];
    const latest = existing[existing.length - 1];
    if (
      latest &&
      now - Date.parse(latest.timestamp) < BUS_ARRIVAL_HISTORY_SAMPLE_MS
    ) {
      continue;
    }

    next[key] = [
      ...existing,
      {
        timestamp: new Date(now).toISOString(),
        nextMinutes: minutesUntil(service.NextBus?.EstimatedArrival, now),
        secondMinutes: minutesUntil(service.NextBus2?.EstimatedArrival, now),
        thirdMinutes: minutesUntil(service.NextBus3?.EstimatedArrival, now),
      },
    ].slice(-BUS_ARRIVAL_HISTORY_MAX_POINTS_PER_SERVICE);
    changed = true;
  }

  return changed ? next : history;
}

export default function BusPanel({
  busStops,
  selectedStop,
  onSelectStop,
  routeState = IDLE_BUS_ROUTE_STATE,
  onShowRoute,
  onClearRoute,
  onSelectRouteDirection,
}: BusPanelProps) {
  const [search, setSearch] = useState("");
  const [expandedService, setExpandedService] = useState<{
    stopCode: string;
    serviceNo: string;
  } | null>(null);
  const [arrivalHistory, setArrivalHistory] = useState<BusArrivalHistoryStore>(
    {},
  );

  const activeStop = selectedStop;
  const activeStopCode = activeStop?.BusStopCode;
  const arrivalsUrl = activeStopCode
    ? `/api/bus-arrivals?stopId=${encodeURIComponent(activeStopCode)}`
    : null;
  const {
    data: arrivals = EMPTY_BUS_ARRIVALS,
    error: arrivalsError,
    isLoading,
  } = useSWR<BusArrival[], Error>(arrivalsUrl, apiFetch<BusArrival[]>, {
    refreshInterval: BUS_ARRIVAL_REFRESH_MS,
    onSuccess: (nextArrivals, key) => {
      const queryStart = key.indexOf("?");
      const stopCode = new URLSearchParams(key.slice(queryStart + 1)).get(
        "stopId",
      );
      if (!stopCode || nextArrivals.length === 0) return;

      setArrivalHistory((previous) => {
        // Merge storage at write time so an early SWR callback cannot replace
        // history before the hydration timer runs.
        const persisted = readPointStore(
          BUS_ARRIVAL_HISTORY_STORAGE_KEY,
          isBusArrivalHistoryPoint,
        );
        const next = appendBusArrivalHistory(
          mergePointStores(persisted, previous),
          stopCode,
          nextArrivals,
        );
        if (next === previous) return previous;
        writePointStore(
          BUS_ARRIVAL_HISTORY_STORAGE_KEY,
          next,
          BUS_ARRIVAL_HISTORY_MAX_POINTS_PER_SERVICE,
          BUS_ARRIVAL_HISTORY_MAX_SERVICES,
        );
        return next;
      });
    },
  });
  const error = arrivalsError?.message ?? null;
  const loading = Boolean(activeStopCode && isLoading);

  const filteredStops = useMemo(() => {
    if (!search.trim()) return [];
    const query = search.toLowerCase();

    return busStops
      .filter(
        (stop) =>
          stop.BusStopCode.includes(search) ||
          stop.Description.toLowerCase().includes(query) ||
          stop.RoadName.toLowerCase().includes(query),
      )
      .slice(0, 8);
  }, [busStops, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setArrivalHistory((current) => {
        const persisted = readPointStore(
          BUS_ARRIVAL_HISTORY_STORAGE_KEY,
          isBusArrivalHistoryPoint,
        );
        const merged = mergePointStores(persisted, current);
        writePointStore(
          BUS_ARRIVAL_HISTORY_STORAGE_KEY,
          merged,
          BUS_ARRIVAL_HISTORY_MAX_POINTS_PER_SERVICE,
          BUS_ARRIVAL_HISTORY_MAX_SERVICES,
        );
        return merged;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleArrivals = useMemo(() => {
    if (!activeStop) return [];

    return [...arrivals].sort((a, b) =>
      compareServiceNumbers(a.ServiceNo, b.ServiceNo),
    );
  }, [activeStop, arrivals]);

  return (
    <TerminalPanel title="BUS ARRIVALS" contentClassName="min-h-44 sm:min-h-56">
      <div className="space-y-3">
        <label className="sr-only" htmlFor="bus-stop-search">
          Search bus stops
        </label>
        <input
          id="bus-stop-search"
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search bus stop code or name"
          className="field-control text-xs"
        />

        {filteredStops.length > 0 ? (
          <div className="grid gap-1">
            {filteredStops.map((stop) => (
              <button
                key={stop.BusStopCode}
                type="button"
                className="interactive-row px-2.5 py-2 text-left"
                onClick={() => {
                  onSelectStop?.(stop);
                  setSearch("");
                }}
              >
                <span className="mr-1 font-mono text-[10px] text-muted">
                  {stop.BusStopCode}
                </span>
                <span>{stop.Description}</span>
              </button>
            ))}
          </div>
        ) : null}

        {activeStop ? (
          <div className="data-row p-2.5">
            <div className="font-medium text-ink">
              {activeStop.Description}
            </div>
            <div className="text-[11px] text-muted">
              {activeStop.BusStopCode} &bull; {activeStop.RoadName}
            </div>
          </div>
        ) : (
          <div className="text-[11px] text-muted">
            Select a bus stop from the map to load arrivals.
          </div>
        )}

        {error ? <div className="text-[12px] text-danger">{error}</div> : null}

        <div className="space-y-2">
          {loading ? (
            <div className="text-[11px] text-muted">
              Loading bus arrivals...
            </div>
          ) : null}

          {!loading && activeStop && !error && visibleArrivals.length === 0 ? (
            <div className="text-[11px] text-muted">
              No live arrival data currently available for this stop.
            </div>
          ) : null}

          {visibleArrivals.map((service) => {
            const isRouteActive =
              routeState.serviceNo === service.ServiceNo &&
              routeState.status !== "idle";
            return (
              <ServiceRow
                key={service.ServiceNo}
                service={service}
                history={
                  activeStopCode
                    ? (arrivalHistory[
                        getArrivalHistoryKey(activeStopCode, service.ServiceNo)
                      ] ?? [])
                    : []
                }
                expanded={
                  expandedService?.stopCode === activeStopCode &&
                  expandedService?.serviceNo === service.ServiceNo
                }
                onToggle={() => {
                  if (!activeStopCode) return;
                  setExpandedService((prev) =>
                    prev?.stopCode === activeStopCode &&
                    prev?.serviceNo === service.ServiceNo
                      ? null
                      : {
                          stopCode: activeStopCode,
                          serviceNo: service.ServiceNo,
                        },
                  );
                }}
                routeActive={isRouteActive}
                routeStatus={
                  isRouteActive ? routeState.status : "idle"
                }
                routeError={isRouteActive ? routeState.error : null}
                routeDirections={
                  isRouteActive && routeState.data
                    ? routeState.data.directions
                    : []
                }
                activeDirection={
                  isRouteActive ? routeState.activeDirection : null
                }
                onToggleRoute={() => {
                  if (
                    routeState.serviceNo === service.ServiceNo &&
                    routeState.status !== "idle"
                  ) {
                    onClearRoute?.();
                  } else {
                    onShowRoute?.(service.ServiceNo);
                  }
                }}
                onSelectDirection={onSelectRouteDirection}
              />
            );
          })}
        </div>
      </div>
    </TerminalPanel>
  );
}

function ServiceRow({
  service,
  history,
  expanded,
  onToggle,
  routeActive,
  routeStatus,
  routeError,
  routeDirections,
  activeDirection,
  onToggleRoute,
  onSelectDirection,
}: {
  service: BusArrival;
  history: ReadonlyArray<BusArrivalHistoryPoint>;
  expanded: boolean;
  onToggle: () => void;
  routeActive: boolean;
  routeStatus: BusRouteUiState["status"];
  routeError: string | null;
  routeDirections: ReadonlyArray<BusRouteDirection>;
  activeDirection: number | null;
  onToggleRoute: () => void;
  onSelectDirection?: (direction: number) => void;
}) {
  const routeLabel =
    routeStatus === "loading"
      ? "…"
      : routeActive
        ? "Hide"
        : "Route";

  return (
    <div className="overflow-hidden border border-line">
      <div className="flex items-stretch">
        <button
          type="button"
          className="min-w-0 flex-1 p-2.5 text-left transition-colors duration-150 hover:bg-surface-hover"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-medium text-ink">
              Service {service.ServiceNo}
            </span>
            <span className="text-[11px] text-muted">{service.Operator}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <ArrivalCell
              label="Next"
              value={formatArrival(service.NextBus?.EstimatedArrival)}
            />
            <ArrivalCell
              label="2nd"
              value={formatArrival(service.NextBus2?.EstimatedArrival)}
            />
            <ArrivalCell
              label="3rd"
              value={formatArrival(service.NextBus3?.EstimatedArrival)}
            />
          </div>
        </button>
        <button
          type="button"
          className={`shrink-0 border-l border-line px-2.5 text-[10px] uppercase tracking-[0.08em] transition-colors duration-150 ${
            routeActive
              ? "bg-success/10 text-success hover:bg-success/15"
              : "text-muted hover:bg-surface-hover hover:text-ink"
          }`}
          onClick={(event) => {
            event.stopPropagation();
            onToggleRoute();
          }}
          aria-pressed={routeActive}
          aria-label={
            routeActive
              ? `Hide route for service ${service.ServiceNo}`
              : `Show route for service ${service.ServiceNo}`
          }
          title={
            routeActive
              ? "Hide route on map"
              : "Show route on map"
          }
          disabled={routeStatus === "loading"}
        >
          {routeLabel}
        </button>
      </div>

      {routeActive && routeStatus === "error" && routeError ? (
        <div className="border-t border-line bg-paper px-2.5 py-1.5 text-[11px] text-danger">
          {routeError}
        </div>
      ) : null}

      {routeActive &&
      routeStatus === "ready" &&
      routeDirections.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-paper px-2.5 py-1.5">
          <span className="data-label mr-1">Dir</span>
          {routeDirections.map((dir) => {
            const selected = dir.direction === activeDirection;
            return (
              <button
                key={dir.direction}
                type="button"
                className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] border transition-colors duration-150 ${
                  selected
                    ? "border-success/45 bg-success/10 text-success"
                    : "border-line text-muted hover:border-line-strong hover:text-ink"
                }`}
                onClick={() => onSelectDirection?.(dir.direction)}
                aria-pressed={selected}
              >
                {dir.direction}
                {dir.preferred ? " ★" : ""}
              </button>
            );
          })}
        </div>
      ) : null}

      {routeActive && routeStatus === "ready" && routeDirections.length > 0 ? (
        <RouteSummary
          directions={routeDirections}
          activeDirection={activeDirection}
        />
      ) : null}

      {expanded ? (
        <div className="space-y-2 border-t border-line bg-paper p-2.5">
          <DeepBusDetail label="Next Bus" bus={service.NextBus} />
          {service.NextBus2 ? (
            <DeepBusDetail label="2nd Bus" bus={service.NextBus2} />
          ) : null}
          {service.NextBus3 ? (
            <DeepBusDetail label="3rd Bus" bus={service.NextBus3} />
          ) : null}

          <div className="border-t border-line pt-2">
            <div className="data-label mb-1">
              Arrival Pattern
            </div>
            <ArrivalPatternDetail history={history} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RouteSummary({
  directions,
  activeDirection,
}: {
  directions: ReadonlyArray<BusRouteDirection>;
  activeDirection: number | null;
}) {
  const active =
    directions.find((d) => d.direction === activeDirection) ?? directions[0];
  if (!active || active.stops.length === 0) return null;
  const origin = active.stops[0]?.description ?? active.originCode;
  const destination =
    active.stops[active.stops.length - 1]?.description ?? active.destinationCode;

  return (
    <div className="border-t border-line bg-paper px-2.5 py-1.5 text-[10px] text-muted">
      <span className="text-ink">{origin}</span>
      <span className="mx-1">→</span>
      <span className="text-ink">{destination}</span>
      <span className="ml-1.5 opacity-75">
        · {active.stops.length} stops
      </span>
    </div>
  );
}

function DeepBusDetail({
  label,
  bus,
}: {
  label: string;
  bus: BusArrival["NextBus"];
}) {
  if (!bus) return null;

  const loadTone = getLoadTone(bus.Load);

  const typeLabel =
    bus.Type === "SD"
      ? "Single"
      : bus.Type === "DD"
        ? "Double"
        : bus.Type === "BD"
          ? "Bendy"
          : bus.Type || "—";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-medium text-ink">{label}</div>
        <div className="flex items-center gap-1.5">
          <LoadDot tone={loadTone} />
          <span className="text-[11px] text-muted">{typeLabel}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <ArrivalCell label="ETA" value={formatArrival(bus.EstimatedArrival)} />
        <ArrivalCell label="Load" value={<LoadBox tone={loadTone} />} />
        <ArrivalCell
          label="Feature"
          value={bus.Feature === "WAB" ? "♿" : "—"}
        />
      </div>
    </div>
  );
}

function ArrivalPatternDetail({
  history,
}: {
  history: ReadonlyArray<BusArrivalHistoryPoint>;
}) {
  const values = history
    .map((point) => point.nextMinutes)
    .filter((value): value is number => Number.isFinite(value));

  if (values.length === 0) {
    return (
      <div className="text-[11px] text-muted">
        No local pattern yet. This browser stores one arrival snapshot every 5
        minutes while the stop is selected.
      </div>
    );
  }

  const latest = values[values.length - 1];
  const average = Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
  const min = Math.min(...values);
  const max = Math.max(...values);

  return (
    <div className="space-y-1 text-[11px] text-muted">
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
        <span>Latest wait: {latest} min</span>
        <span>Avg wait: {average} min</span>
        <span>Min wait: {min} min</span>
        <span>Max wait: {max} min</span>
      </div>
      <MiniArrivalTrend values={values} />
      <div className="text-[10px] opacity-75">
        {values.length} local samples. Stored in this browser only.
      </div>
    </div>
  );
}

function MiniArrivalTrend({ values }: { values: number[] }) {
  const recent = values.slice(-24);
  const min = Math.min(...recent);
  const max = Math.max(...recent);
  const range = max - min;

  return (
    <div className="flex h-8 items-end gap-0.5 border border-line bg-paper px-1 py-1">
      {recent.map((value, index) => {
        const height = range === 0 ? 50 : 18 + ((value - min) / range) * 82;
        return (
          <div
            key={`${index}-${value}`}
            className="w-full min-w-0 bg-info opacity-80"
            style={{ height: `${height}%` }}
            title={`${value} min`}
          />
        );
      })}
    </div>
  );
}

type LoadTone = {
  readonly color: string;
  readonly label: string;
};

function getLoadTone(load?: string): LoadTone {
  const normalized = (load || "").trim().toUpperCase();

  if (normalized === "SEA" || normalized === "SEATS AVAILABLE") {
    return { color: "var(--color-success)", label: "Seats available" };
  }

  if (normalized === "SDA" || normalized === "STANDING AVAILABLE") {
    return { color: "var(--color-warning)", label: "Standing available" };
  }

  if (normalized === "LSD" || normalized === "LIMITED STANDING") {
    return { color: "var(--color-danger)", label: "Limited standing" };
  }

  return { color: "var(--color-muted)", label: "Load unknown" };
}

function LoadDot({ tone }: { tone: LoadTone }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: tone.color }}
      title={tone.label}
    />
  );
}

function LoadBox({ tone }: { tone: LoadTone }) {
  return (
    <span
      className="inline-block h-3 w-3 border border-line-strong"
      style={{ backgroundColor: tone.color }}
      title={tone.label}
    />
  );
}

function ArrivalCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-muted">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function formatArrival(iso?: string): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "—";

  const minutes = Math.floor(ms / 60_000);
  if (minutes <= 0) return "Arr";
  return `${minutes} min`;
}

function compareServiceNumbers(a: string, b: string): number {
  const parsedA = parseServiceNumber(a);
  const parsedB = parseServiceNumber(b);

  if (parsedA.numeric !== parsedB.numeric) {
    return parsedA.numeric - parsedB.numeric;
  }

  return parsedA.raw.localeCompare(parsedB.raw, "en-SG", { numeric: true });
}

function parseServiceNumber(serviceNo: string): {
  numeric: number;
  raw: string;
} {
  const match = serviceNo.match(/^\d+/);
  return {
    numeric: match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY,
    raw: serviceNo,
  };
}
