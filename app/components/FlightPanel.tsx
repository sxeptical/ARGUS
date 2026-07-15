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
  const inbound = flights.filter(
    (flight) => flight.direction === "inbound",
  ).length;
  const outbound = flights.filter(
    (flight) => flight.direction === "outbound",
  ).length;
  const transit = flights.filter(
    (flight) => flight.direction === "transit",
  ).length;

  return (
    <TerminalPanel title="FLIGHTS (SG AIRSPACE)" contentClassName="min-h-40 sm:min-h-48">
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Stat label="Inbound" value={inbound} tone="text-success" />
          <Stat label="Outbound" value={outbound} tone="text-danger" />
          <Stat label="Transit" value={transit} tone="text-info" />
        </div>

        {flights.length === 0 ? (
          <div className="text-[11px] text-muted">
            No live aircraft in current Singapore bounds.
          </div>
        ) : (
          <div className="space-y-1">
            {flights.slice(0, 8).map((flight) => {
              const isSelected = selectedFlight?.id === flight.id;
              return (
                <button
                  key={`${flight.icao24}-${flight.id}`}
                  type="button"
                  onClick={() => onSelectFlight(flight)}
                  className={`w-full border px-2.5 py-2 text-left text-[11px] transition-colors duration-150 ${
                    isSelected
                      ? "border-ink bg-surface-hover"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-hover"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-medium text-ink">
                      {flight.callsign}
                    </span>
                    <span className={directionClassName(flight.direction)}>
                      {flight.direction.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-muted">
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="border border-line bg-paper p-2">
      <div className="data-label">{label}</div>
      <div className={`${tone} mt-1 font-mono text-sm font-medium`}>{value}</div>
    </div>
  );
}

function directionClassName(direction: FlightState["direction"]): string {
  if (direction === "inbound") return "text-success";
  if (direction === "outbound") return "text-danger";
  return "text-info";
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
