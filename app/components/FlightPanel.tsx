import TerminalPanel from "@/app/components/TerminalPanel";
import type { FlightState } from "@/types";

type FlightPanelProps = {
  flights: FlightState[];
  selectedFlight: FlightState | null;
  onSelectFlight: (flight: FlightState) => void;
};

export default function FlightPanel({
  flights,
  selectedFlight,
  onSelectFlight,
}: FlightPanelProps) {
  const inbound = flights.filter((flight) => flight.direction === "inbound").length;
  const outbound = flights.filter((flight) => flight.direction === "outbound").length;
  const transit = flights.filter((flight) => flight.direction === "transit").length;

  return (
    <TerminalPanel title="FLIGHTS (SG AIRSPACE)" contentClassName="min-h-48">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Stat label="Inbound" value={inbound} tone="terminal-green" />
          <Stat label="Outbound" value={outbound} tone="terminal-red" />
          <Stat label="Transit" value={transit} tone="terminal-cyan" />
        </div>

        {flights.length === 0 ? (
          <div className="terminal-dim text-[11px]">No live aircraft in current Singapore bounds.</div>
        ) : (
          <div className="space-y-1">
            {flights.slice(0, 8).map((flight) => {
              const isSelected = selectedFlight?.id === flight.id;
              return (
                <button
                  key={`${flight.icao24}-${flight.id}`}
                  type="button"
                  onClick={() => onSelectFlight(flight)}
                  className={`w-full rounded border px-2 py-1 text-left text-[11px] ${
                    isSelected
                      ? "border-terminal-cyan bg-terminal-cyan/10"
                      : "border-terminal-border/40 bg-black/20 hover:border-terminal-cyan/60"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="terminal-green font-semibold">{flight.callsign}</span>
                    <span className={directionClassName(flight.direction)}>{flight.direction.toUpperCase()}</span>
                  </div>
                  <div className="terminal-dim">
                    {flight.originCountry} • {formatSpeed(flight.velocity)} • {formatAltitude(flight.altitude)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </TerminalPanel>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded border border-terminal-border/40 bg-black/25 p-2">
      <div className="terminal-dim text-[10px]">{label}</div>
      <div className={`${tone} text-sm font-semibold`}>{value}</div>
    </div>
  );
}

function directionClassName(direction: FlightState["direction"]): string {
  if (direction === "inbound") return "terminal-green";
  if (direction === "outbound") return "terminal-red";
  return "terminal-cyan";
}

function formatSpeed(speed: number | null): string {
  if (!Number.isFinite(speed)) return "speed N/A";
  const kmh = Math.round((speed as number) * 3.6);
  return `${kmh} km/h`;
}

function formatAltitude(altitude: number | null): string {
  if (!Number.isFinite(altitude)) return "alt N/A";
  const feet = Math.round((altitude as number) * 3.28084);
  return `${feet.toLocaleString()} ft`;
}
