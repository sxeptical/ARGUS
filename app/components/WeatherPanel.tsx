import TerminalPanel from "@/app/components/TerminalPanel";
import type { WeatherData, WeatherHistoryPoint } from "@/types";
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
  history: WeatherHistoryPoint[];
};

export default function WeatherPanel({ weather, history }: WeatherPanelProps) {
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
          <TemperatureDetail current={weather.temperature} history={history} />
        </ExpandableRow>

        <ExpandableRow
          label="Humidity"
          value={formatMetric(weather.humidity, "%")}
        >
          <HumidityDetail current={weather.humidity} history={history} />
        </ExpandableRow>

        <ExpandableRow label="PSI" value={psiValue} valueClass={psiClass}>
          <PsiDetail
            psi={weather.psi}
            status={weather.psiStatus}
            history={history}
          />
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

type WeatherMetric = "temperature" | "humidity" | "psi";

function TemperatureDetail({
  current,
  history,
}: {
  current: number | null;
  history: WeatherHistoryPoint[];
}) {
  return (
    <div className="space-y-1 text-[11px] terminal-dim">
      <div>
        {current === null
          ? "No station temperature readings are currently available."
          : `Average of available Singapore station readings: ${current}°C.`}
      </div>
      <MetricHistorySummary
        history={history}
        metric="temperature"
        unit="°C"
        label="Local temperature trend"
        barClass="bg-[#3fd3ff]"
      />
    </div>
  );
}

function HumidityDetail({
  current,
  history,
}: {
  current: number | null;
  history: WeatherHistoryPoint[];
}) {
  return (
    <div className="space-y-1 text-[11px] terminal-dim">
      <div>
        {current === null
          ? "No relative humidity readings are currently available."
          : `Average of available Singapore humidity readings: ${current}%.`}
      </div>
      <MetricHistorySummary
        history={history}
        metric="humidity"
        unit="%"
        label="Local humidity trend"
        barClass="bg-[#35f0ce]"
      />
    </div>
  );
}

function PsiDetail({
  psi,
  status,
  history,
}: {
  psi: number | null;
  status: WeatherData["psiStatus"];
  history: WeatherHistoryPoint[];
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

      <MetricHistorySummary
        history={history}
        metric="psi"
        unit=""
        label="Local PSI trend"
        barClass="bg-[#ffd166]"
      />
    </div>
  );
}

function MetricHistorySummary({
  history,
  metric,
  unit,
  label,
  barClass,
}: {
  history: WeatherHistoryPoint[];
  metric: WeatherMetric;
  unit: string;
  label: string;
  barClass: string;
}) {
  const points = history
    .map((point) => ({ timestamp: point.timestamp, value: point[metric] }))
    .filter((point): point is { timestamp: string; value: number } =>
      Number.isFinite(point.value),
    );

  if (points.length === 0) {
    return (
      <div>
        No local history yet. New readings are stored in this browser every 5
        minutes.
      </div>
    );
  }

  const values = points.map((point) => point.value);
  const latest = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
  const firstTimestamp = points[0].timestamp;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em] text-[#8cb2c8]">
        <span>{label}</span>
        <span>{points.length} samples</span>
      </div>
      <MiniTrend values={values} barClass={barClass} />
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
        <span>
          Latest: {latest}
          {unit}
        </span>
        <span>
          Avg: {average}
          {unit}
        </span>
        <span>
          Min: {min}
          {unit}
        </span>
        <span>
          Max: {max}
          {unit}
        </span>
      </div>
      <div className="text-[10px] opacity-75">
        Since {formatTime(firstTimestamp)}. Stored locally in this browser.
      </div>
    </div>
  );
}

function MiniTrend({ values, barClass }: { values: number[]; barClass: string }) {
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
            className={`w-full min-w-0 rounded-t opacity-80 ${barClass}`}
            style={{ height: `${height}%` }}
            title={`${value}`}
          />
        );
      })}
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
