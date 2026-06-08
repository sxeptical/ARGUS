"use client";

import { useEffect, useMemo, useState } from "react";
import TerminalPanel from "@/app/components/TerminalPanel";
import type { BusArrival, BusStop } from "@/types";

type BusPanelProps = {
  busStops: BusStop[];
  selectedStop: BusStop | null;
  onSelectStop?: (stop: BusStop) => void;
};

export default function BusPanel({ busStops, selectedStop, onSelectStop }: BusPanelProps) {
  const [search, setSearch] = useState("");
  const [arrivals, setArrivals] = useState<BusArrival[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedService, setExpandedService] = useState<string | null>(null);

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
    if (!selectedStop) return;

    let cancelled = false;
    const stopCode = selectedStop.BusStopCode;

    const loadArrivals = async () => {
      try {
        if (!cancelled) {
          setLoading(true);
          setArrivals([]);
          setError(null);
          setExpandedService(null);
        }
        const response = await fetch(
          `/api/bus-arrivals?stopId=${encodeURIComponent(stopCode)}`,
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Unable to fetch bus arrivals");
        }

        const data = (await response.json()) as BusArrival[];
        if (cancelled) return;
        setArrivals(data);
      } catch (err) {
        if (cancelled) return;
        setArrivals([]);
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadArrivals();

    return () => {
      cancelled = true;
    };
  }, [selectedStop]);

  const activeStop = selectedStop;
  const visibleArrivals = useMemo(() => {
    if (!activeStop) return [];

    return [...arrivals].sort((a, b) => compareServiceNumbers(a.ServiceNo, b.ServiceNo));
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
                <span className="terminal-cyan text-[11px]">{stop.BusStopCode}</span>{" "}
                <span>{stop.Description}</span>
              </button>
            ))}
          </div>
        ) : null}

        {activeStop ? (
          <div className="rounded border border-terminal-border/60 bg-black/20 p-2">
            <div className="terminal-green font-semibold">{activeStop.Description}</div>
            <div className="terminal-dim text-[11px]">
              {activeStop.BusStopCode} &bull; {activeStop.RoadName}
            </div>
          </div>
        ) : (
          <div className="terminal-dim text-[11px]">Select a bus stop from the map to load arrivals.</div>
        )}

        {error ? <div className="terminal-red text-[12px]">{error}</div> : null}

        <div className="space-y-2">
          {loading ? (
            <div className="terminal-dim text-[11px]">Loading bus arrivals...</div>
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
  expanded,
  onToggle,
}: {
  service: BusArrival;
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
          <span className="terminal-cyan font-semibold">Service {service.ServiceNo}</span>
          <span className="terminal-dim text-[11px]">{service.Operator}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <ArrivalCell label="Next" value={formatArrival(service.NextBus?.EstimatedArrival)} />
          <ArrivalCell label="2nd" value={formatArrival(service.NextBus2?.EstimatedArrival)} />
          <ArrivalCell label="3rd" value={formatArrival(service.NextBus3?.EstimatedArrival)} />
        </div>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${
          expanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="border-t border-terminal-border/30 bg-black/20 p-2 space-y-2">
          <DeepBusDetail label="Next Bus" bus={service.NextBus} />
          {service.NextBus2 ? <DeepBusDetail label="2nd Bus" bus={service.NextBus2} /> : null}
          {service.NextBus3 ? <DeepBusDetail label="3rd Bus" bus={service.NextBus3} /> : null}

          <div className="pt-1 border-t border-terminal-border/20">
            <div className="terminal-dim text-[10px] uppercase tracking-wider mb-1">Arrival Pattern</div>
            <ArrivalSparkline />
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
        <ArrivalCell label="Feature" value={bus.Feature === "WAB" ? "♿" : "—"} />
      </div>
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

function ArrivalSparkline() {
  // Mocked 10-point arrival interval history for demo
  const points = [3, 5, 4, 6, 5, 7, 4, 5, 6, 5];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;

  const width = 200;
  const barWidth = (width - 16) / points.length;

  return (
    <div className="flex items-end gap-1 h-8 px-1">
      {points.map((val, i) => {
        const h = ((val - min) / range) * 100;
        return (
          <div
            key={i}
            className="bg-terminal-cyan/60 rounded-t"
            style={{
              width: `${barWidth - 2}px`,
              height: `${Math.max(h, 15)}%`,
              opacity: 0.4 + (i / points.length) * 0.6,
            }}
          />
        );
      })}
    </div>
  );
}

function ArrivalCell({ label, value }: { label: string; value: React.ReactNode }) {
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

function parseServiceNumber(serviceNo: string): { numeric: number; raw: string } {
  const match = serviceNo.match(/^\d+/);
  return {
    numeric: match ? Number.parseInt(match[0], 10) : Number.POSITIVE_INFINITY,
    raw: serviceNo,
  };
}
