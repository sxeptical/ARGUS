import TerminalPanel from "@/app/components/TerminalPanel";
import { MiniTrend, summarizeValues } from "@/app/components/trend";
import { AQI_BANDS, aqiTone, getAqiStatus } from "@/lib/aqi";
import { formatSgDateTime, formatSgTime } from "@/lib/formatters";
import type {
  AqiRegionKey,
  AqiStatus,
  RegionalAqiReadings,
  WeatherData,
  WeatherHistoryPoint,
} from "@/types";
import { useEffect, useState, type ReactNode } from "react";

function formatMetric(value: number | null, unit: string): string {
  return value === null ? "—" : `${value}${unit}`;
}

type WeatherPanelProps = {
  weather: WeatherData;
  history: WeatherHistoryPoint[];
  onAqiMapOverlayChange?: (regions: RegionalAqiReadings | null) => void;
};

const AQI_TONE_CLASSES = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted",
} as const;

function aqiStatusClass(status: AqiStatus): string {
  return AQI_TONE_CLASSES[aqiTone(status)];
}

const AQI_BADGE_COLORS: Record<
  Exclude<AqiStatus, "Unknown">,
  keyof typeof ACTIVE_METRIC_BADGE_CLASSES
> = {
  Good: "good",
  Moderate: "moderate",
  "Unhealthy for Sensitive Groups": "high",
  Unhealthy: "unhealthy",
  "Very Unhealthy": "danger",
  Hazardous: "danger",
};

function formatIndex(value: number | null, status: string): string {
  return value === null ? "—" : `${value} (${status})`;
}

type AqiWindow = "24h" | "1h";

const REGION_STRIP_ORDER: ReadonlyArray<{
  key: AqiRegionKey;
  label: string;
}> = [
  { key: "north", label: "North" },
  { key: "west", label: "West" },
  { key: "central", label: "Central" },
  { key: "east", label: "East" },
  { key: "south", label: "South" },
];

export default function WeatherPanel({
  weather,
  history,
  onAqiMapOverlayChange,
}: WeatherPanelProps) {
  const [aqiWindow, setAqiWindow] = useState<AqiWindow>("1h");
  const [aqiExpanded, setAqiExpanded] = useState(false);
  const [aqiPinned, setAqiPinned] = useState(false);

  const isDaily = aqiWindow === "24h";
  const aqiStatus = isDaily ? weather.aqiStatus : weather.aqiOneHourStatus;
  const aqiValue = formatIndex(
    isDaily ? weather.aqi : weather.aqiOneHour,
    aqiStatus,
  );
  const activeRegions = isDaily
    ? weather.aqiRegions
    : weather.aqiOneHourRegions;
  const showOnMap = aqiExpanded || aqiPinned;

  useEffect(() => {
    onAqiMapOverlayChange?.(showOnMap ? activeRegions : null);
  }, [showOnMap, activeRegions, onAqiMapOverlayChange]);

  const uvClass =
    weather.uvStatus === "Low"
      ? "text-success"
      : weather.uvStatus === "Moderate"
        ? "text-warning"
        : weather.uvStatus === "High" || weather.uvStatus === "Very High"
          ? "text-danger"
          : "text-muted";
  const uvValue =
    weather.uv === null ? "—" : `${weather.uv} (${weather.uvStatus})`;

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

        <ExpandableRow
          label="Air Quality Index"
          value={`${isDaily ? "24-hr" : "1-hr"} · ${aqiValue}`}
          valueClass={aqiStatusClass(aqiStatus)}
          onExpandedChange={setAqiExpanded}
        >
          <AqiDetail
            aqiWindow={aqiWindow}
            onWindowChange={setAqiWindow}
            aqi={weather.aqi}
            aqiOneHour={weather.aqiOneHour}
            status={weather.aqiStatus}
            oneHourStatus={weather.aqiOneHourStatus}
            regions={activeRegions}
            pinned={aqiPinned}
            onTogglePin={() => setAqiPinned((prev) => !prev)}
            history={history}
          />
        </ExpandableRow>

        <ExpandableRow label="UV Index" value={uvValue} valueClass={uvClass}>
          <UvDetail uv={weather.uv} status={weather.uvStatus} />
        </ExpandableRow>

        <ExpandableRow
          label="4-Day Outlook"
          value={
            weather.fourDay[0]
              ? `${weather.fourDay[0].day} · ${weather.fourDay[0].text}`
              : "—"
          }
        >
          <FourDayDetail outlook={weather.fourDay} />
        </ExpandableRow>

        <div className="space-y-1 pt-1">
          <div className="text-[11px] text-muted">Forecast</div>
          <div className="text-[12px]">{weather.forecast}</div>
        </div>

        <div className="text-[11px] text-muted" suppressHydrationWarning>
          Updated {formatSgDateTime(weather.lastUpdated)}
        </div>
      </div>
    </TerminalPanel>
  );
}

function ExpandableRow({
  label,
  value,
  valueClass,
  onExpandedChange,
  children,
}: {
  label: string;
  value: string;
  valueClass?: string;
  onExpandedChange?: (expanded: boolean) => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden border border-line">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-surface-hover"
        onClick={() => {
          const next = !expanded;
          setExpanded(next);
          onExpandedChange?.(next);
        }}
        aria-expanded={expanded}
      >
        <span className="text-muted">{label}</span>
        <span className={valueClass || ""}>{value}</span>
      </button>

      {expanded ? (
        <div className="space-y-2 border-t border-line bg-paper p-2.5">
          {children}
        </div>
      ) : null}
    </div>
  );
}

type WeatherMetric = "temperature" | "humidity" | "aqi";

function TemperatureDetail({
  current,
  history,
}: {
  current: number | null;
  history: WeatherHistoryPoint[];
}) {
  return (
    <div className="space-y-1 text-[11px] text-muted">
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
        barClass="bg-info"
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
    <div className="space-y-1 text-[11px] text-muted">
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
        barClass="bg-success"
      />
    </div>
  );
}

function AqiDetail({
  aqiWindow,
  onWindowChange,
  aqi,
  aqiOneHour,
  status,
  oneHourStatus,
  regions,
  pinned,
  onTogglePin,
  history,
}: {
  aqiWindow: AqiWindow;
  onWindowChange: (window: AqiWindow) => void;
  aqi: number | null;
  aqiOneHour: number | null;
  status: AqiStatus;
  oneHourStatus: AqiStatus;
  regions: RegionalAqiReadings;
  pinned: boolean;
  onTogglePin: () => void;
  history: WeatherHistoryPoint[];
}) {
  const isDaily = aqiWindow === "24h";
  const activeStatus = isDaily ? status : oneHourStatus;
  const activeValue = isDaily ? aqi : aqiOneHour;
  const activeTabId = `aqi-tab-${aqiWindow}`;
  const activePanelId = `aqi-panel-${aqiWindow}`;

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="AQI averaging window"
        className="grid grid-cols-2 gap-1 text-[10px]"
      >
        {(["24h", "1h"] as const).map((tab) => (
          <button
            key={tab}
            id={`aqi-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={aqiWindow === tab}
            aria-controls={`aqi-panel-${tab}`}
            onClick={() => onWindowChange(tab)}
            className={`border px-2 py-1 uppercase tracking-[0.1em] transition-colors duration-150 ${
              aqiWindow === tab
                ? "border-info/50 bg-info/8 text-info"
                : "border-line text-muted hover:bg-surface-hover"
            }`}
          >
            {tab === "24h" ? "24-hour" : "1-hour"}
          </button>
        ))}
      </div>

      <div
        id={activePanelId}
        role="tabpanel"
        aria-labelledby={activeTabId}
        className="space-y-2"
      >
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
          <span>
            {isDaily ? "24-hr US AQI (worst)" : "1-hr US AQI (worst)"}
          </span>
          <div className="flex items-center gap-2">
            <span>Max: {activeValue === null ? "—" : activeValue}</span>
            <button
              type="button"
              onClick={onTogglePin}
              aria-pressed={pinned}
              className={`border px-1.5 py-0.5 uppercase tracking-[0.08em] transition-colors duration-150 ${
                pinned
                  ? "border-info/50 bg-info/8 text-info"
                  : "border-line text-muted hover:bg-surface-hover hover:text-ink"
              }`}
              title={
                pinned
                  ? "Keep AQI overlay pinned on map when collapsed"
                  : "Pin AQI overlay to map"
              }
            >
              {pinned ? "Pinned" : "Pin map"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 text-[10px]">
          {REGION_STRIP_ORDER.map(({ key, label }) => {
            const val = regions[key];
            const tone = aqiStatusClass(getAqiStatus(val));
            const isWorst =
              val !== null && activeValue !== null && val === activeValue;
            return (
              <div
                key={key}
                title={`${label}: ${val ?? "—"}`}
                className={`border px-1 py-1 text-center font-mono ${
                  isWorst
                    ? "border-line-strong bg-surface-hover"
                    : "border-line"
                }`}
              >
                <div className="text-[9px] text-muted">{label}</div>
                <div className={`font-semibold ${tone}`}>
                  {val === null ? "—" : val}
                </div>
              </div>
            );
          })}
        </div>

        {activeStatus === "Unknown" ? (
          <div className="text-[11px] text-muted">
            {isDaily
              ? "24-hr PM2.5 data is currently unavailable."
              : "1-hr PM2.5 data is currently unavailable."}
          </div>
        ) : null}

        <div className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-1 text-[10px]">
          {AQI_BANDS.map((band) => (
            <MetricBadge
              key={band.status}
              label={band.shortLabel}
              range={band.range}
              active={activeStatus === band.status}
              color={AQI_BADGE_COLORS[band.status]}
            />
          ))}
        </div>

        {isDaily ? (
          <MetricHistorySummary
            history={history}
            metric="aqi"
            unit=""
            label="Local AQI trend"
            barClass="bg-warning"
          />
        ) : (
          <div className="text-[11px] text-muted">
            Derived from regional 1-hr PM2.5 readings using the US EPA AQI
            formula. Expanding this row overlays all 5 regions on the map.
          </div>
        )}
      </div>
    </div>
  );
}

function UvDetail({
  uv,
  status,
}: {
  uv: number | null;
  status: WeatherData["uvStatus"];
}) {
  return (
    <div className="space-y-2 text-[11px] text-muted">
      <div>{uv === null ? "UV data is currently unavailable." : "UV updates hourly."}</div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(3.75rem,1fr))] gap-1 text-[10px]">
        <MetricBadge label="Low" range="0–2" active={status === "Low"} color="good" />
        <MetricBadge label="Moderate" range="3–5" active={status === "Moderate"} color="moderate" />
        <MetricBadge label="High" range="6–7" active={status === "High"} color="high" />
        <MetricBadge label="Very High" range="8–10" active={status === "Very High"} color="unhealthy" />
        <MetricBadge label="Extreme" range="11+" active={status === "Extreme"} color="danger" />
      </div>
    </div>
  );
}

function FourDayDetail({
  outlook,
}: {
  outlook: WeatherData["fourDay"];
}) {
  if (outlook.length === 0) {
    return <div className="text-[11px] text-muted">4-day outlook unavailable.</div>;
  }
  return (
    <div className="space-y-1 text-[11px]">
      {outlook.map((entry) => (
        <div key={`${entry.day}-${entry.text}`} className="flex gap-2">
          <span className="w-16 shrink-0 text-muted">{entry.day}</span>
          <span className="min-w-0 flex-1">{entry.text}</span>
          <span className="whitespace-nowrap text-muted">{entry.tempLow}°–{entry.tempHigh}°C</span>
        </div>
      ))}
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
  const { latest, average, min, max } = summarizeValues(values);
  const firstTimestamp = points[0].timestamp;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.1em] text-muted">
        <span>{label}</span>
        <span>{points.length} samples</span>
      </div>
      <MiniTrend values={values} barClass={barClass} rounded />
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
        Since {formatSgTime(firstTimestamp)}. Stored locally in this browser.
      </div>
    </div>
  );
}

const ACTIVE_METRIC_BADGE_CLASSES = {
  good: "border-success/50 bg-success/8 text-success",
  moderate: "border-warning/50 bg-warning/8 text-warning",
  high: "border-warning/50 bg-warning/8 text-warning",
  unhealthy: "border-danger/50 bg-danger/8 text-danger",
  danger: "border-danger/50 bg-danger/8 text-danger",
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
      className={`min-w-0 border px-1.5 py-1 text-center [overflow-wrap:anywhere] ${
        active
          ? ACTIVE_METRIC_BADGE_CLASSES[color]
          : "border-line text-muted"
      }`}
    >
      <div className="font-semibold">{label}</div>
      <div className="opacity-70">{range}</div>
    </div>
  );
}
