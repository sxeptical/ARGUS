import TerminalPanel from "@/app/components/TerminalPanel";
import type { WeatherData } from "@/types";
import { useState, type ReactNode } from "react";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-SG", {
    timeZone: "Asia/Singapore",
  });
}

function formatMetric(value: number | null, unit: string): string {
  return value === null ? "—" : `${value}${unit}`;
}

type WeatherPanelProps = {
  weather: WeatherData;
};

export default function WeatherPanel({ weather }: WeatherPanelProps) {
  const psiClass =
    weather.psiStatus === "Good"
      ? "terminal-green"
      : weather.psiStatus === "Moderate"
        ? "terminal-yellow"
        : weather.psiStatus === "Unhealthy"
          ? "terminal-red"
          : "terminal-dim";

  const psiValue =
    weather.psi === null ? "—" : `${weather.psi} (${weather.psiStatus})`;

  return (
    <TerminalPanel title="WEATHER" contentClassName="min-h-40">
      <div className="space-y-2">
        <ExpandableRow
          label="Temperature"
          value={formatMetric(weather.temperature, "°C")}
        >
          <TemperatureDetail current={weather.temperature} />
        </ExpandableRow>

        <ExpandableRow
          label="Humidity"
          value={formatMetric(weather.humidity, "%")}
        >
          <div className="text-[11px] terminal-dim">
            Relative humidity is not available from the current dashboard feed.
          </div>
        </ExpandableRow>

        <ExpandableRow label="PSI" value={psiValue} valueClass={psiClass}>
          <PsiDetail psi={weather.psi} status={weather.psiStatus} />
        </ExpandableRow>

        <div className="space-y-1 pt-1">
          <div className="terminal-dim text-[11px]">Forecast</div>
          <div className="text-[12px]">{weather.forecast}</div>
        </div>

        <div className="terminal-dim text-[11px]" suppressHydrationWarning>
          Updated {formatTime(weather.lastUpdated)}
        </div>
      </div>
    </TerminalPanel>
  );
}

function ExpandableRow({
  label,
  value,
  valueClass,
  children,
}: {
  label: string;
  value: string;
  valueClass?: string;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border border-terminal-border/30 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-2 py-1.5 text-left hover:bg-terminal-green/5 transition-colors"
        onClick={() => setExpanded((previous) => !previous)}
        aria-expanded={expanded}
      >
        <span className="terminal-dim">{label}</span>
        <span className={valueClass || ""}>{value}</span>
      </button>

      <div
        className={`transition-all duration-300 ease-in-out ${
          expanded ? "max-h-64 opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="border-t border-terminal-border/20 bg-black/20 p-2 space-y-2">
          {children}
        </div>
      </div>
    </div>
  );
}

function TemperatureDetail({ current }: { current: number | null }) {
  return (
    <div className="space-y-1 text-[11px] terminal-dim">
      <div>
        {current === null
          ? "No station temperature readings are currently available."
          : `Average of available Singapore station readings: ${current}°C.`}
      </div>
      <div>
        Historical temperature trend data is not included in the current feed.
      </div>
    </div>
  );
}

function PsiDetail({
  psi,
  status,
}: {
  psi: number | null;
  status: WeatherData["psiStatus"];
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] terminal-dim">
        <span>24-hour national PSI</span>
        <span>Now: {psi === null ? "—" : psi}</span>
      </div>

      {status === "Unknown" ? (
        <div className="text-[11px] terminal-dim">
          PSI data is currently unavailable.
        </div>
      ) : null}

      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <MetricBadge
          label="Good"
          range="0–50"
          active={status === "Good"}
          color="good"
        />
        <MetricBadge
          label="Moderate"
          range="51–100"
          active={status === "Moderate"}
          color="moderate"
        />
        <MetricBadge
          label="Unhealthy"
          range="101+"
          active={status === "Unhealthy"}
          color="unhealthy"
        />
      </div>
    </div>
  );
}

const ACTIVE_METRIC_BADGE_CLASSES = {
  good: "border-green-400/60 bg-green-400/10 terminal-green",
  moderate: "border-yellow-400/60 bg-yellow-400/10 terminal-yellow",
  unhealthy: "border-red-400/60 bg-red-400/10 terminal-red",
} as const;

function MetricBadge({
  label,
  range,
  active,
  color,
}: {
  label: string;
  range: string;
  active: boolean;
  color: keyof typeof ACTIVE_METRIC_BADGE_CLASSES;
}) {
  return (
    <div
      className={`rounded border px-1.5 py-0.5 text-center ${
        active
          ? ACTIVE_METRIC_BADGE_CLASSES[color]
          : "border-terminal-border/20 terminal-dim"
      }`}
    >
      <div className="font-semibold">{label}</div>
      <div className="opacity-70">{range}</div>
    </div>
  );
}
