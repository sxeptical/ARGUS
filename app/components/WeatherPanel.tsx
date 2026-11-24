import type { SourceStatus } from "@/app/hooks/use-dashboard-sources";
import TerminalPanel from "@/app/components/TerminalPanel";
import { MiniTrend, summarizeValues } from "@/app/components/trend";
import { usePersistentState } from "@/app/hooks/use-persistent-state";
import {
  PM25_BANDS,
  PSI_BANDS,
  getPm25Band,
  getPsiStatus,
  pm25Tone,
  psiTone,
} from "@/lib/air-quality";
import { formatSgDateTime, formatSgTime } from "@/lib/formatters";
import { formatRadius, type GeoFilter } from "@/lib/geo-filter";
import {
  buildRainMapData,
  filterAreaNamesByGeoFilter,
  geoFilterToMinimapEllipse,
  MINIMAP_HEIGHT,
  MINIMAP_WIDTH,
  type MinimapAreaDot,
} from "@/lib/rain-map";
import { isThunderyForecast } from "@/lib/rain-outlook";
import { HEAVY_RAIN_MM, LIGHTNING_NEAR_M } from "@/lib/weather-alerts";
import {
  AIR_SECTION_PINNED_KEY,
  RAIN_SECTION_PINNED_KEY,
  parseStoredBoolean,
  prefKey,
} from "@/lib/ui-preferences";
import type {
  AirQualityOverlay,
  AirQualityTone,
  AirRegionKey,
  Pm25Band,
  PsiStatus,
  RainMapTone,
  RainMapWindow,
  RainOutlook,
  RainOverlay,
  RegionalAirReadings,
  WeatherAlerts,
  WeatherData,
  WeatherHistoryPoint,
} from "@/types";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

function formatMetric(value: number | null, unit: string): string {
  return value === null ? "—" : `${value}${unit}`;
}

type WeatherPanelProps = {
  feedStatus: SourceStatus;
  weather: WeatherData;
  /** Lightning and rainfall over the last half hour, from their own feed. */
  storms: WeatherAlerts;
  history: WeatherHistoryPoint[];
  geoFilter?: GeoFilter | null;
  onAirQualityOverlayChange?: (overlay: AirQualityOverlay | null) => void;
  onRainOverlayChange?: (overlay: RainOverlay | null) => void;
  onFocusLocation?: (target: { lat: number; lng: number; zoom: number }) => void;
  /** Extra classes on the panel section (e.g. a max height + internal
      scroll in a height-constrained column). */
  className?: string;
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
  feedStatus,
  weather,
  storms,
  history,
  geoFilter = null,
  onAirQualityOverlayChange,
  onRainOverlayChange,
  onFocusLocation,
  className,
}: WeatherPanelProps) {
  const [airWindow, setAirWindow] = useState<AirWindow>("1h");
  const [airPinned, setAirPinned] = usePersistentState(
    AIR_SECTION_PINNED_KEY,
    false,
    parseStoredBoolean,
  );
  const [airExpanded, setAirExpanded] = useState(false);

  const [rainWindow, setRainWindow] = useState<RainMapWindow>("now");
  const [rainPinned, setRainPinned] = usePersistentState(
    RAIN_SECTION_PINNED_KEY,
    false,
    parseStoredBoolean,
  );
  const [rainExpanded, setRainExpanded] = useState(false);

  const rainMapData = useMemo(
    () => buildRainMapData(rainWindow, storms, weather.rainOutlook, geoFilter),
    [rainWindow, storms, weather.rainOutlook, geoFilter],
  );
  const showRainOnMap = rainExpanded || rainPinned;

  useEffect(() => {
    onRainOverlayChange?.(
      showRainOnMap ? { window: rainWindow, areas: rainMapData.active } : null,
    );
  }, [showRainOnMap, rainWindow, rainMapData.active, onRainOverlayChange]);

  useEffect(() => {
    return () => onRainOverlayChange?.(null);
  }, [onRainOverlayChange]);

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

  // A pinned overlay survives collapse (`showOnMap` keeps it), but nothing
  // should stay on the map once this panel goes away.
  useEffect(() => {
    return () => onAirQualityOverlayChange?.(null);
  }, [onAirQualityOverlayChange]);

  const uvClass =
    weather.uvStatus === "Low"
      ? "text-success"
      : weather.uvStatus === "Moderate"
        ? "text-warning"
        : weather.uvStatus === "High" || weather.uvStatus === "Very High"
          ? "text-danger"
          : "text-muted";
  const rainSummary = summarizeRainRow(storms, weather.rainOutlook, geoFilter);
  const uvValue =
    weather.uv === null ? "—" : `${weather.uv} (${weather.uvStatus})`;

  return (
    <TerminalPanel
      feedStatus={feedStatus}
      title="WEATHER"
      className={className}
      contentClassName="min-h-40 xl:min-h-0"
    >
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
          label="Rain"
          value={rainSummary.text}
          valueClass={TONE_CLASSES[rainSummary.tone]}
          onExpandedChange={setRainExpanded}
        >
          <RainLightningDetail
            rainWindow={rainWindow}
            onWindowChange={setRainWindow}
            storms={storms}
            outlook={weather.rainOutlook}
            geoFilter={geoFilter}
            dots={rainMapData.dots}
            activeCount={rainMapData.active.length}
            inRadiusCount={rainMapData.inRadiusCount}
            pinned={rainPinned}
            onTogglePin={() => setRainPinned((prev) => !prev)}
            onFocusLocation={onFocusLocation}
          />
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
  /** Reports expansion changes, including hydrated-from-storage updates. */
  onExpandedChange?: (expanded: boolean) => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = usePersistentState(
    prefKey("weather-section", label),
    false,
    parseStoredBoolean,
  );
  const onExpandedChangeRef = useRef(onExpandedChange);

  useEffect(() => {
    onExpandedChangeRef.current = onExpandedChange;
  });

  useEffect(() => {
    onExpandedChangeRef.current?.(expanded);
  }, [expanded]);

  // TerminalPanel unmounts its content when collapsed, so this cleanup is how
  // an outer panel collapse reaches the caller. Without it a collapsed Weather
  // panel would keep reporting its air section as expanded, pinning the overlay.
  useEffect(() => {
    return () => onExpandedChangeRef.current?.(false);
  }, []);

  return (
    <div className="overflow-hidden border border-line">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-surface-hover"
        onClick={() => setExpanded((prev) => !prev)}
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

/**
 * Compact one-line summary for the Rain row: active conditions (rain, lightning)
 * beat forecast, and the worst of them sets the colour. Respects `geoFilter`.
 */
function summarizeRainRow(
  storms: WeatherAlerts,
  outlook: RainOutlook,
  geoFilter?: GeoFilter | null,
): { text: string; tone: AirQualityTone } {
  const { rain, lightning } = storms;
  const heavyAreas = rain ? filterAreaNamesByGeoFilter(rain.heavyAreas, geoFilter) : [];
  const rainingAreas = rain ? filterAreaNamesByGeoFilter(rain.rainingAreas, geoFilter) : [];
  const lightningAreas = lightning ? filterAreaNamesByGeoFilter(lightning.areas, geoFilter) : [];
  const parts: string[] = [];
  let tone: AirQualityTone = "muted";

  if (heavyAreas.length > 0) {
    parts.push(geoFilter ? `Heavy · ${plural(heavyAreas.length, "area")}` : `Heavy · ${rain?.peakMm} mm`);
    tone = "warning";
  } else if (rainingAreas.length > 0) {
    parts.push(
      geoFilter
        ? `Rain · ${plural(rainingAreas.length, "area")}`
        : `${rain?.maxMm} mm · ${plural(rainingAreas.length, "area")}`,
    );
    tone = "muted";
  }
  if (lightning && lightning.strikes > 0 && lightningAreas.length > 0) {
    parts.push(
      geoFilter
        ? "Lightning"
        : parts.length > 0
          ? "Lightning"
          : `Lightning · ${lightning.strikes}`,
    );
    tone = lightning.groundStrikes > 0 ? "danger" : "warning";
  }
  if (parts.length > 0) {
    return { text: parts.join(" · "), tone };
  }
  const next = outlook.nextTwoHours;
  if (next) {
    const scopedNext = geoFilter
      ? next.rain.filter(
          (entry) => filterAreaNamesByGeoFilter([entry.place], geoFilter).length > 0,
        )
      : next.rain;
    if (scopedNext.length > 0) {
      return {
        text: geoFilter
          ? `2h · ${plural(scopedNext.length, "area")}`
          : `2h · ${scopedNext.length}/${next.areaCount} areas`,
        tone: scopedNext.some((entry) => isThunderyForecast(entry.forecast)) ? "warning" : "muted",
      };
    }
    return { text: "Dry", tone: "muted" };
  }
  if (rain) return { text: "Dry", tone: "muted" };
  return { text: "—", tone: "muted" };
}

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

const REGION_ABBR: Record<string, string> = {
  north: "N",
  south: "S",
  east: "E",
  west: "W",
  central: "C",
};

const RAIN_DOT_COLOR: Record<RainMapTone, string> = {
  info: "var(--color-info)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

const RAIN_TEXT_CLASS: Record<RainMapTone, string> = {
  info: "text-info",
  warning: "text-warning",
  danger: "text-danger",
};

/** Compact 1-line summary for a 24h period (e.g. "Thundery Showers · N, W"). */
function summarizePeriodRain(period: RainOutlook["periods"][number]): {
  text: string;
  tone: AirQualityTone;
  detail: string;
} {
  if (period.rain.length === 0) {
    return { text: "Dry", tone: "muted", detail: "No rain expected" };
  }
  const thundery = period.rain.some((entry) => isThunderyForecast(entry.forecast));
  const byForecast = new Map<string, string[]>();
  for (const entry of period.rain) {
    byForecast.set(entry.forecast, [...(byForecast.get(entry.forecast) ?? []), entry.place]);
  }
  const ordered = [...byForecast.entries()].sort(
    ([a], [b]) => Number(isThunderyForecast(b)) - Number(isThunderyForecast(a)) || a.localeCompare(b),
  );
  const [primaryForecast, primaryPlaces] = ordered[0];
  const detail = ordered
    .map(([forecast, places]) => `${forecast}: ${places.join(", ")}`)
    .join(" · ");

  if (ordered.length === 1 && primaryPlaces.length >= period.regionCount) {
    return {
      text: `${primaryForecast} · All`,
      tone: thundery ? "warning" : "muted",
      detail,
    };
  }
  const regionCodes = period.rain
    .map((entry) => REGION_ABBR[entry.place.toLowerCase()] ?? entry.place)
    .join(",");
  return {
    text: `${primaryForecast} · ${regionCodes}`,
    tone: thundery ? "warning" : "muted",
    detail,
  };
}

function SingaporeRainMinimap({
  rainWindow,
  dots,
  geoFilter,
  onFocusLocation,
}: {
  rainWindow: RainMapWindow;
  dots: ReadonlyArray<MinimapAreaDot>;
  geoFilter?: GeoFilter | null;
  onFocusLocation?: (target: { lat: number; lng: number; zoom: number }) => void;
}) {
  const [hoveredDot, setHoveredDot] = useState<MinimapAreaDot | null>(null);

  const orderedDots = useMemo(() => {
    if (!hoveredDot) return dots;
    return [
      ...dots.filter((dot) => dot.name !== hoveredDot.name),
      hoveredDot,
    ];
  }, [dots, hoveredDot]);

  const filterEllipse = useMemo(
    () => (geoFilter ? geoFilterToMinimapEllipse(geoFilter) : null),
    [geoFilter],
  );

  return (
    <div className="border border-line bg-surface">
      <svg
        viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
        className="block h-auto w-full select-none"
        role="img"
        aria-label={`Singapore ${rainWindow === "now" ? "live rain and lightning" : "2-hour rain forecast"} minimap`}
        onMouseLeave={() => setHoveredDot(null)}
      >
        {orderedDots.map((dot) => {
          const isHovered = hoveredDot?.name === dot.name;
          const color = dot.active ? RAIN_DOT_COLOR[dot.active.tone] : "var(--color-muted)";
          const label = !dot.inRadius
            ? `${dot.name}: Outside radius`
            : dot.active
              ? `${dot.name}: ${dot.active.label}`
              : `${dot.name}: Dry`;
          const fill = dot.active ? color : "var(--color-surface-raised)";
          const fillOpacity = !dot.inRadius
            ? 0.35
            : dot.active
              ? dot.active.tone === "danger"
                ? 0.34
                : 0.26
              : 1;
          const stroke = isHovered
            ? "var(--color-ink)"
            : dot.active
              ? color
              : "var(--color-line)";
          const strokeOpacity = !dot.inRadius && !isHovered ? 0.35 : 1;
          const strokeWidth = isHovered
            ? 1.3
            : dot.active
              ? dot.active.lightning
                ? 1.15
                : 0.85
              : 0.65;
          return (
            <g
              key={dot.name}
              role="button"
              tabIndex={0}
              aria-label={label}
              className={onFocusLocation ? "cursor-pointer outline-none" : "outline-none"}
              onMouseEnter={() => setHoveredDot(dot)}
              onFocus={() => setHoveredDot(dot)}
              onBlur={() => setHoveredDot((cur) => (cur?.name === dot.name ? null : cur))}
              onClick={() => onFocusLocation?.({ lat: dot.lat, lng: dot.lng, zoom: 13 })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFocusLocation?.({ lat: dot.lat, lng: dot.lng, zoom: 13 });
                }
              }}
            >
              {dot.svgPath ? (
                <path
                  d={dot.svgPath}
                  fill={fill}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                />
              ) : (
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={dot.active ? 3.5 : 1.7}
                  fill={fill}
                  fillOpacity={fillOpacity}
                  stroke={stroke}
                  strokeOpacity={strokeOpacity}
                  strokeWidth={strokeWidth}
                />
              )}
            </g>
          );
        })}
        {filterEllipse ? (
          <ellipse
            cx={filterEllipse.cx}
            cy={filterEllipse.cy}
            rx={filterEllipse.rx}
            ry={filterEllipse.ry}
            fill="none"
            stroke="var(--color-info)"
            strokeWidth={0.9}
            strokeDasharray="2 1.5"
            pointerEvents="none"
          />
        ) : null}
      </svg>

      <div className="flex items-center justify-between gap-2 border-t border-line px-2 py-1 text-[10px]">
        {hoveredDot ? (
          <div className="min-w-0 truncate">
            <span className="font-medium text-ink">{hoveredDot.name}</span>
            <span className="text-muted"> · </span>
            <span
              className={
                !hoveredDot.inRadius
                  ? "text-muted"
                  : hoveredDot.active
                    ? RAIN_TEXT_CLASS[hoveredDot.active.tone]
                    : "text-muted"
              }
            >
              {!hoveredDot.inRadius
                ? "Outside radius"
                : (hoveredDot.active?.label ?? "Dry")}
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.06em] text-muted">
              {rainWindow === "now" ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-info" />
                    Rain
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                    Heavy
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-danger" />
                    Lightning
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-info" />
                    Showers
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                    Thundery
                  </span>
                </>
              )}
            </div>
            {onFocusLocation ? (
              <span className="shrink-0 text-[9px] text-faint">Click area to pan</span>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function RainLightningDetail({
  rainWindow,
  onWindowChange,
  storms,
  outlook,
  geoFilter,
  dots,
  activeCount,
  inRadiusCount,
  pinned,
  onTogglePin,
  onFocusLocation,
}: {
  rainWindow: RainMapWindow;
  onWindowChange: (window: RainMapWindow) => void;
  storms: WeatherAlerts;
  outlook: RainOutlook;
  geoFilter?: GeoFilter | null;
  dots: ReadonlyArray<MinimapAreaDot>;
  activeCount: number;
  inRadiusCount: number;
  pinned: boolean;
  onTogglePin: () => void;
  onFocusLocation?: (target: { lat: number; lng: number; zoom: number }) => void;
}) {
  const { rain, lightning } = storms;
  const scopedHeavy = rain ? filterAreaNamesByGeoFilter(rain.heavyAreas, geoFilter) : [];
  const scopedRaining = rain ? filterAreaNamesByGeoFilter(rain.rainingAreas, geoFilter) : [];
  const scopedLightning = lightning ? filterAreaNamesByGeoFilter(lightning.areas, geoFilter) : [];

  const rainTone: AirQualityTone =
    scopedHeavy.length > 0
      ? "warning"
      : scopedRaining.length > 0
        ? "success"
        : "muted";
  const rainValue = !rain
    ? "—"
    : geoFilter
      ? scopedHeavy.length > 0
        ? "Heavy"
        : scopedRaining.length > 0
          ? "Rain"
          : "Dry"
      : scopedHeavy.length > 0
        ? `${rain.peakMm} mm`
        : rain.rainingStations > 0
          ? `${rain.maxMm} mm`
          : "Dry";
  const rainAreaCount = new Set([...scopedHeavy, ...scopedRaining]).size;
  const rainSub = !rain
    ? "Unavailable"
    : geoFilter
      ? rainAreaCount > 0
        ? `${plural(rainAreaCount, "area")} in radius`
        : "in radius"
      : `${rain.rainingStations}/${rain.stationCount} gauges`;

  const hasScopedLightning = Boolean(lightning && lightning.strikes > 0 && scopedLightning.length > 0);
  const lightningTone: AirQualityTone = hasScopedLightning
    ? lightning!.groundStrikes > 0
      ? "danger"
      : "warning"
    : "muted";
  const lightningValue = !lightning
    ? "—"
    : geoFilter
      ? hasScopedLightning
        ? "Active"
        : "None"
      : lightning.strikes > 0
        ? `${lightning.strikes}`
        : "None";
  const lightningSub = !lightning
    ? "Unavailable"
    : geoFilter
      ? hasScopedLightning
        ? `${plural(scopedLightning.length, "area")} in radius`
        : "in radius"
      : lightning.strikes > 0
        ? `${lightning.groundStrikes} ground${lightning.lastStrikeAt ? ` · ${formatSgTime(lightning.lastStrikeAt)}` : ""}`
        : `<${LIGHTNING_NEAR_M / 1000} km`;

  const next = outlook.nextTwoHours;
  const mapSummary = geoFilter
    ? (rainWindow === "now" && !rain && !lightning) || (rainWindow === "2h" && !next)
      ? "Unavailable"
      : activeCount > 0
        ? `${activeCount}/${inRadiusCount} in ${formatRadius(geoFilter.radiusM)}`
        : `Clear · ${formatRadius(geoFilter.radiusM)}`
    : rainWindow === "now"
      ? !rain && !lightning
        ? "Unavailable"
        : activeCount > 0
          ? `${plural(activeCount, "active area")}`
          : "All clear"
      : !next
        ? "Unavailable"
        : next.rain.length === 0
          ? "Dry"
          : `${next.rain.length}/${next.areaCount} areas`;

  const windowRangeTitle =
    rainWindow === "2h" && next?.validFrom && next.validTo
      ? `${formatSgTime(next.validFrom)}–${formatSgTime(next.validTo)}`
      : undefined;

  return (
    <div className="space-y-2 text-[11px]">
      {/* Live telemetry tiles */}
      <div className="grid grid-cols-2 gap-1.5">
        <div
          className="border border-line px-2 py-1.5 font-mono"
          title={`NEA rain gauges · heavy ≥ ${HEAVY_RAIN_MM} mm / 15 min`}
        >
          <div className="text-[9px] uppercase tracking-[0.08em] text-muted">
            Rain (15m)
          </div>
          <div className={`mt-0.5 text-sm font-semibold ${rainTone === "success" ? "text-info" : TONE_CLASSES[rainTone]}`}>
            {rainValue}
          </div>
          <div className="truncate text-[10px] text-muted">{rainSub}</div>
        </div>

        <div
          className="border border-line px-2 py-1.5 font-mono"
          title={`Lightning within ${LIGHTNING_NEAR_M / 1000} km in the last 30 min`}
        >
          <div className="text-[9px] uppercase tracking-[0.08em] text-muted">
            Lightning (30m)
          </div>
          <div className={`mt-0.5 text-sm font-semibold ${TONE_CLASSES[lightningTone]}`}>
            {lightningValue}
          </div>
          <div className="truncate text-[10px] text-muted" suppressHydrationWarning>
            {lightningSub}
          </div>
        </div>
      </div>

      {/* Mode tabs: live radar-style vs next 2h forecast */}
      <div
        role="tablist"
        aria-label="Rain map timeframe"
        className="grid grid-cols-2 gap-1 text-[10px]"
      >
        {(["now", "2h"] as const).map((tab) => (
          <button
            key={tab}
            id={`rain-tab-${tab}`}
            type="button"
            role="tab"
            aria-selected={rainWindow === tab}
            aria-controls={`rain-panel-${tab}`}
            onClick={() => onWindowChange(tab)}
            className={`border px-2 py-1 uppercase tracking-[0.1em] transition-colors duration-150 ${
              rainWindow === tab
                ? "border-info/50 bg-info/8 text-info"
                : "border-line text-muted hover:bg-surface-hover"
            }`}
          >
            {tab === "now" ? "Now" : "Next 2h"}
          </button>
        ))}
      </div>

      <div
        id={`rain-panel-${rainWindow}`}
        role="tabpanel"
        aria-labelledby={`rain-tab-${rainWindow}`}
        className="space-y-1.5"
      >
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
          <span title={windowRangeTitle}>{mapSummary}</span>
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
                ? "Keep rain overlay pinned on map when collapsed"
                : "Pin rain overlay to map"
            }
          >
            {pinned ? "Pinned" : "Pin map"}
          </button>
        </div>

        <SingaporeRainMinimap
          rainWindow={rainWindow}
          dots={dots}
          geoFilter={geoFilter}
          onFocusLocation={onFocusLocation}
        />
      </div>

      {/* Next 24 hours — compact 1-line-per-period table */}
      {outlook.periods.length > 0 ? (
        <div className="space-y-1 border-t border-line pt-2">
          <div className="data-label">Next 24h</div>
          <div className="space-y-0.5">
            {outlook.periods.map((period) => {
              const summary = summarizePeriodRain(period);
              return (
                <div
                  key={period.start}
                  title={summary.detail}
                  className="flex items-baseline justify-between gap-2 text-[10px]"
                >
                  <span className="shrink-0 text-muted">{period.label}</span>
                  <span
                    className={`truncate text-right font-mono ${
                      summary.tone === "warning"
                        ? "text-warning"
                        : summary.text === "Dry"
                          ? "text-muted"
                          : "text-info"
                    }`}
                  >
                    {summary.text}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {rain ? (
        <div
          className="border-t border-line pt-1.5 text-[10px] text-muted"
          suppressHydrationWarning
          title={`Heavy rain ≥ ${HEAVY_RAIN_MM} mm in 15 min · Lightning within ${LIGHTNING_NEAR_M / 1000} km`}
        >
          NEA gauges · {formatSgTime(rain.observedAt)}
        </div>
      ) : null}
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
