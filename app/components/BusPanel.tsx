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

    const loadArrivals = async () => {
      try {
        const response = await fetch(
          `/api/bus-arrivals?stopId=${encodeURIComponent(selectedStop.BusStopCode)}`,
        );

        if (!response.ok) {
          throw new Error("Unable to fetch bus arrivals");
        }

        const data = (await response.json()) as BusArrival[];
        if (cancelled) return;
        setArrivals(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };

    void loadArrivals();
    const timer = setInterval(() => {
      void loadArrivals();
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedStop]);

  const activeStop = selectedStop;
  const visibleArrivals = activeStop ? arrivals : [];

  return (
    <TerminalPanel title="BUS ARRIVALS" className="min-h-56">
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
              {activeStop.BusStopCode} • {activeStop.RoadName}
            </div>
          </div>
        ) : (
          <div className="terminal-dim text-[11px]">Select a bus stop from the map to load arrivals.</div>
        )}

        {error ? <div className="terminal-red">{error}</div> : null}

        <div className="space-y-2">
          {visibleArrivals.map((service) => (
            <div key={service.ServiceNo} className="rounded border border-terminal-border/50 p-2">
              <div className="mb-1 flex items-center justify-between">
                <span className="terminal-cyan font-semibold">Service {service.ServiceNo}</span>
                <span className="terminal-dim text-[11px]">{service.Operator}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <ArrivalCell label="Next" value={formatArrival(service.NextBus?.EstimatedArrival)} />
                <ArrivalCell label="2nd" value={formatArrival(service.NextBus2?.EstimatedArrival)} />
                <ArrivalCell label="3rd" value={formatArrival(service.NextBus3?.EstimatedArrival)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </TerminalPanel>
  );
}

function ArrivalCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="terminal-dim">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function formatArrival(iso?: string): string {
  if (!iso) return "--";
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return "--";

  const minutes = Math.floor(ms / 60_000);
  if (minutes <= 0) return "Arr";
  return `${minutes} min`;
}
