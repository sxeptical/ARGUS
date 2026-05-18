import type { WeatherData } from "@/types";
import TerminalPanel from "@/app/components/TerminalPanel";

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
    <TerminalPanel title="WEATHER" className="min-h-40">
      <div className="space-y-2">
        <Row label="Temperature" value={`${weather.temperature || "--"} C`} />
        <Row label="Humidity" value={weather.humidity > 0 ? `${weather.humidity}%` : "N/A"} />
        <div className="flex items-center justify-between gap-3">
          <span className="terminal-dim">PSI</span>
          <span className={psiClass}>
            {weather.psi} ({weather.psiStatus})
          </span>
        </div>
        <div className="space-y-1">
          <div className="terminal-dim">Forecast</div>
          <div>{weather.forecast}</div>
        </div>
        <div className="terminal-dim text-[11px]" suppressHydrationWarning>
          Updated {new Date(weather.lastUpdated).toLocaleTimeString()}
        </div>
      </div>
    </TerminalPanel>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="terminal-dim">{label}</span>
      <span>{value}</span>
    </div>
  );
}
