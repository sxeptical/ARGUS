import TerminalPanel from "@/app/components/TerminalPanel";
import { MiniTrend, summarizeValues } from "@/app/components/trend";
import {
  PM25_BANDS,
  PSI_BANDS,
  getPm25Band,
  getPsiStatus,
  pm25Tone,
  psiTone,
} from "@/lib/air-quality";
import { formatSgDateTime, formatSgTime } from "@/lib/formatters";
import type {
  AirQualityOverlay,
  AirQualityTone,
  AirRegionKey,
  Pm25Band,
  PsiStatus,
  RegionalAirReadings,
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
  onAirQualityOverlayChange?: (overlay: AirQualityOverlay | null) => void;
};

const TONE_CLASSES: Record<AirQualityTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  muted: "text-muted",
};

type BadgeColor = keyof typeof ACTIVE_METRIC_BADGE_CLASSES;

const PSI_BADGE_COLORS: Record<Exclude<PsiStatus, "Unknown">, BadgeColor> = {
  Good: "good",
  Moderate: "moderate",
  Unhealthy: "unhealthy",
  "Very Unhealthy": "danger",
  Hazardous: "danger",
};

const PM25_BADGE_COLORS: Record<Exclude<Pm25Band, "Unknown">, BadgeColor> = {
  Normal: "good",
  Elevated: "moderate",
  High: "unhealthy",
  "Very High": "danger",
};

/** 24-hr tab shows NEA PSI; 1-hr tab shows NEA 1-hr PM2.5 (µg/m³). */
type AirWindow = "24h" | "1h";

const regionTone = (window: AirWindow, value: number | null): AirQualityTone =>
  window === "24h"
    ? psiTone(getPsiStatus(value))
    : pm25Tone(getPm25Band(value));

function buildOverlay(
  window: AirWindow,
  regions: RegionalAirReadings,
): AirQualityOverlay {
  const overlay = {} as AirQualityOverlay;
  for (const { key } of REGION_STRIP_ORDER) {
    overlay[key] = { value: regions[key], tone: regionTone(window, regions[key]) };
  }
  return overlay;
}

const REGION_STRIP_ORDER: ReadonlyArray<{
  key: AirRegionKey;
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
  onAirQualityOverlayChange,
}: WeatherPanelProps) {
  const [airWindow, setAirWindow] = useState<AirWindow>("1h");
  const [airExpanded, setAirExpanded] = useState(false);
  const [airPinned, setAirPinned] = useState(false);

  const isDaily = airWindow === "24h";
  const airTone = isDaily
    ? psiTone(weather.psiStatus)
    : pm25Tone(weather.pm25OneHourBand);
  const airValue = isDaily
    ? weather.psi === null
      ? "—"
      : `24-hr PSI · ${weather.psi} (${weather.psiStatus})`
    : weather.pm25OneHour === null
      ? "—"
      : `1-hr PM2.5 · ${weather.pm25OneHour} µg/m³ (${weather.pm25OneHourBand})`;
  const activeRegions = isDaily
    ? weather.psiRegions
    : weather.pm25OneHourRegions;
  const showOnMap = airExpanded || airPinned;

  useEffect(() => {
    onAirQualityOverlayChange?.(
      showOnMap ? buildOverlay(airWindow, activeRegions) : null,
    );
  }, [showOnMap, airWindow, activeRegions, onAirQualityOverlayChange]);

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
          label="Air Quality"
          value={airValue}
          valueClass={TONE_CLASSES[airTone]}
          onExpandedChange={setAirExpanded}
        >
          <AirQualityDetail
            airWindow={airWindow}
            onWindowChange={setAirWindow}
            psi={weather.psi}
            psiStatus={weather.psiStatus}
            pm25={weather.pm25OneHour}
            pm25Band={weather.pm25OneHourBand}
            regions={activeRegions}
            pinned={airPinned}
            onTogglePin={() => setAirPinned((prev) => !prev)}
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

type WeatherMetric = "temperature" | "humidity" | "psi";

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

function AirQualityDetail({
  airWindow,
  onWindowChange,
  psi,
  psiStatus,
  pm25,
  pm25Band,
  regions,
  pinned,
  onTogglePin,
  history,
}: {
  airWindow: AirWindow;
  onWindowChange: (window: AirWindow) => void;
  psi: number | null;
  psiStatus: PsiStatus;
  pm25: number | null;
  pm25Band: Pm25Band;
  regions: RegionalAirReadings;
  pinned: boolean;
  onTogglePin: () => void;
  history: WeatherHistoryPoint[];
}) {
  const isDaily = airWindow === "24h";
  const activeValue = isDaily ? psi : pm25;
  const activeTabId = `air-tab-${airWindow}`;
  const activePanelId = `air-panel-${airWindow}`;

  return (
    <div className="space-y-2">
      <div
        role="tablist"
        aria-label="Air quality averaging window"
        className="grid grid-cols-2 gap-1 text-[10px]"
      >
        {(["24h", "1h"] as const).map((tab) => (
          <button
            key={tab}
            id={`air-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={airWindow === tab}
            aria-controls={`air-panel-${tab}`}
            onClick={() => onWindowChange(tab)}
            className={`border px-2 py-1 uppercase tracking-[0.1em] transition-colors duration-150 ${
              airWindow === tab
                ? "border-info/50 bg-info/8 text-info"
                : "border-line text-muted hover:bg-surface-hover"
            }`}
          >
            {tab === "24h" ? "24-hr PSI" : "1-hr PM2.5"}
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
            {isDaily ? "NEA 24-hr PSI by region" : "NEA 1-hr PM2.5 (µg/m³) by region"}
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
                  ? "Keep air quality overlay pinned on map when collapsed"
                  : "Pin air quality overlay to map"
              }
            >
              {pinned ? "Pinned" : "Pin map"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1 text-[10px]">
          {REGION_STRIP_ORDER.map(({ key, label }) => {
            const val = regions[key];
            const tone = TONE_CLASSES[regionTone(airWindow, val)];
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

        {activeValue === null ? (
          <div className="text-[11px] text-muted">
            {isDaily
              ? "PSI data is currently unavailable."
              : "1-hr PM2.5 data is currently unavailable."}
          </div>
        ) : null}

        {isDaily ? (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-1 text-[10px]">
            {PSI_BANDS.map((band) => (
              <MetricBadge
                key={band.status}
                label={band.status}
                range={band.range}
                active={psiStatus === band.status}
                color={PSI_BADGE_COLORS[band.status]}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(4.5rem,1fr))] gap-1 text-[10px]">
            {PM25_BANDS.map((band) => (
              <MetricBadge
                key={band.band}
                label={band.label}
                range={band.range}
                active={pm25Band === band.band}
                color={PM25_BADGE_COLORS[band.band]}
              />
            ))}
          </div>
        )}

        {isDaily ? (
          <MetricHistorySummary
            history={history}
            metric="psi"
            unit=""
            label="Local PSI trend"
            barClass="bg-warning"
          />
        ) : (
          <div className="text-[11px] text-muted">
            NEA&apos;s 1-hr PM2.5 concentration and bands, which show
            current haze conditions. Expanding this row overlays all 5
            regions on the map.
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
