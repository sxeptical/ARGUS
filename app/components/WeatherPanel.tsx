import type { WeatherData } from "@/types";
import TerminalPanel from "@/app/components/TerminalPanel";
import { useState } from "react";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore" });
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
        : "terminal-red";

  return (
    <TerminalPanel title="WEATHER" contentClassName="min-h-40">
      <div className="space-y-2">
        <ExpandableRow label="Temperature" value={`${weather.temperature || "—"}°C`}>
          <TemperatureDetail current={weather.temperature} />
        </ExpandableRow>

        <ExpandableRow label="Humidity" value={weather.humidity > 0 ? `${weather.humidity}%` : "—"}>
          <div className="text-[11px] terminal-dim">Humidity data from NEA weather stations.</div>
        </ExpandableRow>

        <ExpandableRow label="PSI" value={`${weather.psi} (${weather.psiStatus})`} valueClass={psiClass}>
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
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border border-terminal-border/30 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 px-2 py-1.5 text-left hover:bg-terminal-green/5 transition-colors"
        onClick={() => setExpanded((p) => !p)}
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

function TemperatureDetail({ current }: { current: number }) {
  // Mocked 24h temperature data (°C) for Singapore
  const history = [26, 27, 28, 29, 30, 31, 32, 31, 30, 29, 28, 27];
  const labels = ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] terminal-dim">
        <span>24h Trend (°C)</span>
        <span>Now: {current || "—"}°C</span>
      </div>
      <Sparkline data={history} labels={labels} color="#6be6ff" unit="°C" />
    </div>
  );
}

function PsiDetail({ psi, status }: { psi: number; status: string }) {
  // Mocked 24h PSI data
  const history = [42, 45, 48, 52, 55, 58, 62, 55, 48, 45, 43, 40];
  const labels = ["00:00", "02:00", "04:00", "06:00", "08:00", "10:00", "12:00", "14:00", "16:00", "18:00", "20:00", "22:00"];

  const statusColor =
    status === "Good" ? "#54ffae" : status === "Moderate" ? "#ffd166" : "#ff6b6b";

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] terminal-dim">
        <span>24h PSI Trend</span>
        <span>Now: {psi}</span>
      </div>
      <Sparkline data={history} labels={labels} color={statusColor} unit="PSI" />

      <div className="grid grid-cols-3 gap-1 text-[10px]">
        <MetricBadge label="Good" range="0–50" active={status === "Good"} color="terminal-green" />
        <MetricBadge label="Moderate" range="51–100" active={status === "Moderate"} color="terminal-yellow" />
        <MetricBadge label="Unhealthy" range="101+" active={status === "Unhealthy"} color="terminal-red" />
      </div>
    </div>
  );
}

function MetricBadge({
  label,
  range,
  active,
  color,
}: {
  label: string;
  range: string;
  active: boolean;
  color: string;
}) {
  return (
    <div
      className={`rounded border px-1.5 py-0.5 text-center ${
        active
          ? `border-${color.split("-")[1]}-400/60 bg-${color.split("-")[1]}-400/10 ${color}`
          : "border-terminal-border/20 terminal-dim"
      }`}
    >
      <div className="font-semibold">{label}</div>
      <div className="opacity-70">{range}</div>
    </div>
  );
}

function Sparkline({
  data,
  labels,
  color,
  unit,
}: {
  data: number[];
  labels: string[];
  color: string;
  unit: string;
}) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const width = 220;
  const barWidth = (width - 24) / data.length;

  return (
    <div className="space-y-1 relative">
      {/* Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            left: `${hoveredIndex * barWidth + 8}px`,
            bottom: "48px",
            transform: "translateX(-50%)",
          }}
        >
          <div className="rounded-md border border-terminal-border/50 bg-[#0f171c] px-2.5 py-1.5 shadow-[0_0_12px_rgba(0,0,0,0.5)] whitespace-nowrap">
            <div className="text-[10px] terminal-dim mb-0.5">{labels[hoveredIndex]}</div>
            <div className="text-[13px] font-semibold" style={{ color }}>
              {data[hoveredIndex]} {unit}
            </div>
          </div>
          {/* Arrow */}
          <div className="mx-auto w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[5px] border-t-[#0f171c] mt-[-1px]" />
        </div>
      )}

      <div className="flex items-end gap-0.5 h-10 px-1">
        {data.map((val, i) => {
          const h = ((val - min) / range) * 100;
          return (
            <div
              key={i}
              className="rounded-t transition-all duration-500 cursor-pointer hover:brightness-125"
              style={{
                width: `${barWidth - 2}px`,
                height: `${Math.max(h, 10)}%`,
                backgroundColor: color,
                opacity: hoveredIndex === i ? 1 : 0.3 + (i / data.length) * 0.7,
              }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          );
        })}
      </div>
      <div className="flex justify-between px-1 text-[9px] terminal-dim">
        {labels.map((label, i) => (
          <span key={i} className={i % 3 === 0 ? "" : "hidden sm:inline"}>
            {label.split(":")[0]}
          </span>
        ))}
      </div>
    </div>
  );
}
