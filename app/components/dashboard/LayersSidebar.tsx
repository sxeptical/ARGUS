"use client";

import { Fragment, type Dispatch, type SetStateAction } from "react";
import FlightPanel from "@/app/components/FlightPanel";
import WeatherPanel from "@/app/components/WeatherPanel";
import {
  EyeGlyph,
  LayerFilterInput,
  LayerGroupHeader,
  LayerOptionFilter,
} from "@/app/components/dashboard/LayerControls";
import { IntelPanel } from "@/app/components/dashboard/IntelPanel";
import { useLayerList } from "@/app/hooks/use-layer-list";
import type {
  SensorRow,
  SensorStatsRow,
} from "@/app/hooks/use-dashboard-state";
import type { SensorKey } from "@/lib/layers";
import type { GymBrandCount } from "@/lib/gyms";
import type { HeritageKindCount } from "@/lib/heritage";
import { HERITAGE_KIND_LABEL } from "@/lib/heritage";
import type { HealthcareKindCount } from "@/lib/healthcare";
import { HEALTHCARE_KIND_LABEL } from "@/lib/healthcare";
import type { SupermarketBrandCount } from "@/lib/supermarkets";
import { FLIGHTS_ENABLED } from "@/lib/features";
import type {
  FlightState,
  AirQualityOverlay,
  WeatherData,
  WeatherHistoryPoint,
} from "@/types";

export function LayersSidebar({
  flights,
  selectedFlight,
  sensorRows,
  sensorStatsRows,
  sensorVisibility,
  setSelectedFlight,
  setSensorVisibility,
  gymBrands,
  gymBrandCounts,
  onGymBrandsChange,
  heritageKinds,
  heritageKindCounts,
  onHeritageKindsChange,
  healthcareKinds,
  healthcareKindCounts,
  onHealthcareKindsChange,
  supermarketBrands,
  supermarketBrandCounts,
  onSupermarketBrandsChange,
  visibleSensorCount,
  weather,
  weatherHistory,
  onAirQualityOverlayChange,
}: {
  flights: FlightState[];
  selectedFlight: FlightState | null;
  sensorRows: ReadonlyArray<SensorRow>;
  sensorStatsRows: ReadonlyArray<SensorStatsRow>;
  sensorVisibility: Record<SensorKey, boolean>;
  setSelectedFlight: (flight: FlightState) => void;
  setSensorVisibility: Dispatch<SetStateAction<Record<SensorKey, boolean>>>;
  gymBrands: Record<string, boolean>;
  gymBrandCounts: GymBrandCount[];
  onGymBrandsChange: (next: Record<string, boolean>) => void;
  heritageKinds: Record<string, boolean>;
  heritageKindCounts: HeritageKindCount[];
  onHeritageKindsChange: (next: Record<string, boolean>) => void;
  healthcareKinds: Record<string, boolean>;
  healthcareKindCounts: HealthcareKindCount[];
  onHealthcareKindsChange: (next: Record<string, boolean>) => void;
  supermarketBrands: Record<string, boolean>;
  supermarketBrandCounts: SupermarketBrandCount[];
  onSupermarketBrandsChange: (next: Record<string, boolean>) => void;
  visibleSensorCount: number;
  weather: WeatherData;
  weatherHistory: WeatherHistoryPoint[];
  onAirQualityOverlayChange?: (overlay: AirQualityOverlay | null) => void;
}) {
  const {
    groups,
    filter,
    setFilter,
    filterActive,
    isGroupCollapsed,
    toggleGroupCollapsed,
    toggleGroupVisibility,
  } = useLayerList({
    rows: sensorRows,
    visibility: sensorVisibility,
    setVisibility: setSensorVisibility,
  });

  return (
    <aside className="order-4 flex min-w-0 flex-col gap-2 sm:gap-3 xl:order-1 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
      <IntelPanel
        title="Layers"
        badge={`${visibleSensorCount}/${sensorRows.length}`}
      >
        <div className="space-y-2">
          {/* Layer controls live in the map drawer below xl; keep this panel
              to the stat summary there. */}
          <div className="max-xl:hidden space-y-2">
            <LayerFilterInput value={filter} onChange={setFilter} />
            {groups.map((group) => (
              <div key={group.id}>
                <LayerGroupHeader
                  label={group.label}
                  visibleCount={group.visibleCount}
                  totalCount={group.rows.length}
                  collapsed={isGroupCollapsed(group.id)}
                  anyVisible={group.visibleCount > 0}
                  onToggleCollapsed={() => toggleGroupCollapsed(group.id)}
                  onToggleVisible={() => toggleGroupVisibility(group.id)}
                />
                {isGroupCollapsed(group.id) ? null : (
                  <div className="space-y-1 pt-1">
                    {group.rows.map((row) => (
                      <Fragment key={row.label}>
                      <div
                        className="data-row flex items-center justify-between gap-3 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-xs text-ink">
                            {row.label}
                          </div>
                          <div className="data-label truncate">{row.note}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setSensorVisibility((previous) => ({
                                ...previous,
                                [row.key]: !previous[row.key],
                              }))
                            }
                            aria-label={`${sensorVisibility[row.key] ? "Hide" : "Show"} ${row.label}`}
                            title={`${sensorVisibility[row.key] ? "Hide" : "Show"} ${row.label}`}
                            aria-pressed={sensorVisibility[row.key]}
                            className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-150 ${
                              sensorVisibility[row.key]
                                ? "border-success/45 bg-success/8 text-success hover:bg-success/12"
                                : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink"
                            }`}
                          >
                            <EyeGlyph visible={sensorVisibility[row.key]} />
                          </button>
                          <div
                            className={`min-w-7 text-right font-mono text-sm font-medium ${row.tone}`}
                          >
                            {row.value}
                          </div>
                        </div>
                      </div>
                      {row.key === "gyms" && sensorVisibility.gyms ? (
                        <LayerOptionFilter
                          summaryLabel="Brands"
                          options={gymBrandCounts.map(({ brand, count }) => ({ value: brand, label: brand, count }))}
                          selected={gymBrands}
                          onChange={onGymBrandsChange}
                          accentClass="bg-signal-gym"
                        />
                      ) : null}
                      {row.key === "heritage" && sensorVisibility.heritage ? (
                        <LayerOptionFilter
                          summaryLabel="Types"
                          options={heritageKindCounts.map(({ kind, count }) => ({ value: kind, label: HERITAGE_KIND_LABEL[kind], count }))}
                          selected={heritageKinds}
                          onChange={onHeritageKindsChange}
                          accentClass="bg-signal-heritage"
                        />
                      ) : null}
                      {row.key === "healthcare" && sensorVisibility.healthcare ? (
                        <LayerOptionFilter
                          summaryLabel="Types"
                          options={healthcareKindCounts.map(({ kind, count }) => ({ value: kind, label: HEALTHCARE_KIND_LABEL[kind], count }))}
                          selected={healthcareKinds}
                          onChange={onHealthcareKindsChange}
                          accentClass="bg-signal-healthcare"
                        />
                      ) : null}
                      {row.key === "supermarkets" && sensorVisibility.supermarkets ? (
                        <LayerOptionFilter
                          summaryLabel="Brands"
                          options={supermarketBrandCounts.map(({ brand, count }) => ({ value: brand, label: brand, count }))}
                          selected={supermarketBrands}
                          onChange={onSupermarketBrandsChange}
                          accentClass="bg-signal-supermarket"
                        />
                      ) : null}
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filterActive && groups.length === 0 ? (
              <div className="px-2.5 py-3 text-[10px] uppercase tracking-[0.1em] text-muted">
                No layers match
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            {sensorStatsRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 border-b border-line px-2.5 py-2 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs text-ink">{row.label}</div>
                  <div className="data-label truncate">{row.note}</div>
                </div>
                <div className={`font-mono text-sm font-medium ${row.tone}`}>
                  {row.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </IntelPanel>

      <WeatherPanel
        weather={weather}
        history={weatherHistory}
        onAirQualityOverlayChange={onAirQualityOverlayChange}
      />
      {FLIGHTS_ENABLED ? (
        <FlightPanel
          flights={flights}
          selectedFlight={selectedFlight}
          onSelectFlight={setSelectedFlight}
        />
      ) : null}
    </aside>
  );
}
