"use client";

import { useEffect } from "react";
import { IntelPanel } from "@/app/components/dashboard/IntelPanel";
import {
  formatRadius,
  GEO_FILTER_MAX_RADIUS_M,
  GEO_FILTER_MIN_RADIUS_M,
  GEO_FILTER_RADIUS_STEP_M,
  type GeoFilter,
} from "@/lib/geo-filter";

const BUTTON_CLASS =
  "inline-flex min-h-7 items-center whitespace-nowrap border px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";

export function GeoFilterPanel({
  filter,
  radiusM,
  picking,
  onRadiusChange,
  onPickingChange,
  onClear,
}: {
  filter: GeoFilter | null;
  radiusM: number;
  picking: boolean;
  onRadiusChange: (radiusM: number) => void;
  onPickingChange: (picking: boolean) => void;
  onClear: () => void;
}) {
  // Escape backs out of pick mode, mirroring the map hint overlay.
  useEffect(() => {
    if (!picking) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onPickingChange(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [picking, onPickingChange]);

  return (
    <IntelPanel
      title="Radius Filter"
      badge={picking ? "Picking" : filter ? formatRadius(filter.radiusM) : "Off"}
    >
      <div className="space-y-2 px-1 text-[11px]">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPickingChange(!picking)}
            aria-pressed={picking}
            className={`${BUTTON_CLASS} ${
              picking
                ? "border-ink bg-ink text-paper"
                : "border-line text-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {filter ? "Move Centre" : "Set Centre"}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={!filter && !picking}
            className={`${BUTTON_CLASS} border-line text-muted enabled:hover:border-line-strong enabled:hover:text-ink`}
          >
            Clear
          </button>
        </div>

        <label className="block">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="data-label">Radius</span>
            <span className="font-mono text-xs text-ink">
              {formatRadius(radiusM)}
            </span>
          </div>
          <input
            type="range"
            min={GEO_FILTER_MIN_RADIUS_M}
            max={GEO_FILTER_MAX_RADIUS_M}
            step={GEO_FILTER_RADIUS_STEP_M}
            value={radiusM}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
            aria-valuetext={formatRadius(radiusM)}
            className="h-1 w-full cursor-pointer accent-info"
          />
        </label>

        <div className="text-muted">
          {picking
            ? "Click anywhere on the map to place the centre."
            : filter
              ? "Only feeds inside the circle are shown. MRT lines and bus routes stay whole."
              : "Set a centre to limit the map and panels to a radius."}
        </div>
      </div>
    </IntelPanel>
  );
}
