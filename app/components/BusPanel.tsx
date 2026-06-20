import { useEffect, useMemo, useState } from "react";
import TerminalPanel from "@/app/components/TerminalPanel";
import type { BusArrival, BusStop } from "@/types";

type BusPanelProps = {
  busStops: BusStop[];
  selectedStop: BusStop | null;
  onSelectStop?: (stop: BusStop) => void;
};

type BusArrivalHistoryPoint = {
  timestamp: string;
  nextMinutes: number | null;
  secondMinutes: number | null;
  thirdMinutes: number | null;
};

type BusArrivalHistoryStore = Record<string, BusArrivalHistoryPoint[]>;

const BUS_ARRIVAL_HISTORY_STORAGE_KEY = "argus.bus-arrival-history.v1";
const BUS_ARRIVAL_HISTORY_SAMPLE_MS = 5 * 60 * 1000;
const BUS_ARRIVAL_HISTORY_MAX_POINTS_PER_SERVICE = 288;

function getArrivalHistoryKey(stopCode: string, serviceNo: string): string {
  return `${stopCode}:${serviceNo}`;
}

function readBusArrivalHistory(): BusArrivalHistoryStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(BUS_ARRIVAL_HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as BusArrivalHistoryStore;
  } catch {
    return {};
  }
}

function writeBusArrivalHistory(history: BusArrivalHistoryStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BUS_ARRIVAL_HISTORY_STORAGE_KEY,
      JSON.stringify(history),
    );
  } catch {
    // Keep live arrivals working even when localStorage is unavailable.
  }
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
  arrivals: BusArrival[],
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
}: BusPanelProps) {
  const [search, setSearch] = useState("");
  const [arrivals, setArrivals] = useState<BusArrival[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedService, setExpandedService] = useState<string | null>(null);
  const [arrivalHistory, setArrivalHistory] = useState<BusArrivalHistoryStore>(
    {},
  );

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
    const timer = setTimeout(
      () => setArrivalHistory(readBusArrivalHistory()),
      0,
    );
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!selectedStop) return;

    let cancelled = false;
    const stopCode = selectedStop.BusStopCode;

    const loadArrivals = async (initialLoad = false) => {
      try {
        if (!cancelled) {
          setLoading(true);
          setError(null);
          if (initialLoad) {
            setArrivals([]);
            setExpandedService(null);
          }
        }

        const response = await fetch(
          `/api/bus-arrivals?stopId=${encodeURIComponent(stopCode)}`,
          { cache: "no-store" },
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error || "Unable to fetch bus arrivals");
        }

        const data = (await response.json()) as BusArrival[];
        if (cancelled) return;
        setArrivals(data);
        setArrivalHistory((previous) => {
          const next = appendBusArrivalHistory(previous, stopCode, data);
          if (next === previous) return previous;
          writeBusArrivalHistory(next);
          return next;
        });
      } catch (err) {
        if (cancelled) return;
        if (initialLoad) setArrivals([]);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadArrivals(true);
    const refreshTimer = setInterval(() => {
      void loadArrivals(false);
    }, 15 * 1000);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [selectedStop]);

  const activeStop = selectedStop;
  const activeStopCode = activeStop?.BusStopCode;
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
          className="w-full rounded-md border border-terminal-border bg-black/20 px-2 py-1 text-[12px] outline-none focus:border-terminal-cyan"
        />

        {filteredStops.length > 0 ? (
          <div className="grid gap-1">
            {filteredStops.map((stop) => (
              <button
                key={stop.BusStopCode}
                type="button"
                className="rounded border border-transparent bg-white/2 px-2 py-1 text-left hover:border-terminal-border hover:bg-terminal-green/10"
                onClick={() => {
                  onSelectStop?.(stop);
                  setSearch("");
                }}
              >
                <span className="terminal-cyan text-[11px]">
                  {stop.BusStopCode}
                </span>{" "}
                <span>{stop.Description}</span>
              </button>
            ))}
          </div>
        ) : null}

        {activeStop ? (
          <div className="rounded border border-terminal-border/60 bg-black/20 p-2">
            <div className="terminal-green font-semibold">
              {activeStop.Description}
            </div>
            <div className="terminal-dim text-[11px]">
              {activeStop.BusStopCode} &bull; {activeStop.RoadName}
            </div>
          </div>
        ) : (
          <div className="terminal-dim text-[11px]">
            Select a bus stop from the map to load arrivals.
          </div>
        )}

        {error ? <div className="terminal-red text-[12px]">{error}</div> : null}

        <div className="space-y-2">
          {loading ? (
            <div className="terminal-dim text-[11px]">
              Loading bus arrivals...
            </div>
          ) : null}

          {!loading && activeStop && !error && visibleArrivals.length === 0 ? (
            <div className="terminal-dim text-[11px]">
              No live arrival data currently available for this stop.
            </div>
          ) : null}

          {visibleArrivals.map((service) => (
            <ServiceRow
              key={service.ServiceNo}
              service={service}
              history={
                activeStopCode
                  ? arrivalHistory[
                      getArrivalHistoryKey(activeStopCode, service.ServiceNo)
                    ] ?? []
                  : []
              }
              expanded={expandedService === service.ServiceNo}
              onToggle={() =>
                setExpandedService((prev) =>
                  prev === service.ServiceNo ? null : service.ServiceNo,
                )
              }
            />
          ))}
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
}: {
  service: BusArrival;
  history: BusArrivalHistoryPoint[];
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded border border-terminal-border/50 overflow-hidden">
      <button
        type="button"
        className="w-full p-2 text-left hover:bg-terminal-green/5 transition-colors"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="terminal-cyan font-semibold">
            Service {service.ServiceNo}
          </span>
          <span className="terminal-dim text-[11px]">{service.Operator}</span>
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

      <div
        className={`transition-all duration-300 ease-in-out ${
          expanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="border-t border-terminal-border/30 bg-black/20 p-2 space-y-2">
          <DeepBusDetail label="Next Bus" bus={service.NextBus} />
          {service.NextBus2 ? (
            <DeepBusDetail label="2nd Bus" bus={service.NextBus2} />
          ) : null}
          {service.NextBus3 ? (
            <DeepBusDetail label="3rd Bus" bus={service.NextBus3} />
          ) : null}

          <div className="pt-1 border-t border-terminal-border/20">
            <div className="terminal-dim text-[10px] uppercase tracking-wider mb-1">
              Arrival Pattern
            </div>
            <ArrivalPatternDetail history={history} />
          </div>
        </div>
      </div>
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

  const loadColor = getLoadColor(bus.Load);

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
        <div className="text-[11px] font-semibold text-[#8ccff0]">{label}</div>
        <div className="flex items-center gap-1.5">
          <LoadDot color={loadColor} />
          <span className="text-[11px] terminal-dim">{typeLabel}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <ArrivalCell label="ETA" value={formatArrival(bus.EstimatedArrival)} />
        <ArrivalCell label="Load" value={<LoadBox color={loadColor} />} />
        <ArrivalCell
          label="Feature"
          value={bus.Feature === "WAB" ? "♿" : "—"}
        />
      </div>
    </div>
  );
}

function ArrivalPatternDetail({ history }: { history: BusArrivalHistoryPoint[] }) {
  const values = history
    .map((point) => point.nextMinutes)
    .filter((value): value is number => Number.isFinite(value));

  if (values.length === 0) {
    return (
      <div className="terminal-dim text-[11px]">
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
    <div className="space-y-1 text-[11px] terminal-dim">
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
    <div className="flex h-8 items-end gap-0.5 rounded border border-terminal-border/20 bg-black/20 px-1 py-1">
      {recent.map((value, index) => {
        const height = range === 0 ? 50 : 18 + ((value - min) / range) * 82;
        return (
          <div
            key={`${index}-${value}`}
            className="w-full min-w-0 rounded-t bg-[#90f5ff] opacity-80"
            style={{ height: `${height}%` }}
            title={`${value} min`}
          />
        );
      })}
    </div>
  );
}

function getLoadColor(load?: string): string {
  const normalized = (load || "").trim().toUpperCase();

  if (normalized === "SEA" || normalized === "SEATS AVAILABLE") {
    return "#54ffae"; // terminal-green
  }

  if (normalized === "SDA" || normalized === "STANDING AVAILABLE") {
    return "#ffd166"; // terminal-yellow
  }

  if (normalized === "LSD" || normalized === "LIMITED STANDING") {
    return "#ff6b6b"; // terminal-red
  }

  return "#7f9b91"; // terminal-dim
}

function LoadDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
      title={
        color === "#54ffae"
          ? "Seats Available"
          : color === "#ffd166"
            ? "Standing Available"
            : color === "#ff6b6b"
              ? "Limited Standing"
              : "Unknown"
      }
    />
  );
}

function LoadBox({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-sm border border-white/20"
      style={{ backgroundColor: color }}
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
      <div className="terminal-dim">{label}</div>
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
