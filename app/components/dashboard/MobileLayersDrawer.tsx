"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  SensorKey,
  SensorRow,
} from "@/app/hooks/use-dashboard-state";

// Dot colors mirror the map legend tones in app/page.tsx.
const DOT_TONE: Record<SensorKey, string> = {
  flights: "bg-signal-inbound",
  cameras: "bg-signal-camera",
  busStops: "bg-signal-bus",
  mrt: "bg-signal-mrt",
  parks: "bg-signal-park",
  incidents: "bg-signal-incident",
};

export function MobileLayersDrawer({
  sensorRows,
  sensorVisibility,
  setSensorVisibility,
  visibleSensorCount,
}: {
  sensorRows: ReadonlyArray<SensorRow>;
  sensorVisibility: Record<SensorKey, boolean>;
  setSensorVisibility: Dispatch<SetStateAction<Record<SensorKey, boolean>>>;
  visibleSensorCount: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open map layers menu"
        aria-expanded={open}
        aria-controls="mobile-layers-drawer"
        className="fixed left-[env(safe-area-inset-left)] top-1/2 z-40 flex h-12 w-8 -translate-y-1/2 items-center justify-center rounded-r-sm border border-l-0 border-line bg-surface-raised text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-surface-hover xl:hidden"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M2 4h12M2 8h12M2 12h12" />
        </svg>
      </button>

      <div
        aria-hidden="true"
        onClick={close}
        className={`fixed inset-0 z-40 bg-overlay transition-opacity duration-200 ease-out xl:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        id="mobile-layers-drawer"
        inert={!open}
        aria-label="Map layers"
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[82vw] flex-col border-r border-line bg-surface transition-transform duration-200 ease-out xl:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3 pl-[max(0.75rem,env(safe-area-inset-left))] pr-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
              Layers
            </div>
            <div className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
              {visibleSensorCount}/{sensorRows.length} visible
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={close}
            aria-label="Close map layers menu"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm border border-line bg-paper text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-3 w-3"
              aria-hidden="true"
            >
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          {sensorRows.map((row) => {
            const visible = sensorVisibility[row.key];
            return (
              <button
                key={row.key}
                type="button"
                onClick={() =>
                  setSensorVisibility((previous) => ({
                    ...previous,
                    [row.key]: !previous[row.key],
                  }))
                }
                aria-pressed={visible}
                aria-label={`${visible ? "Hide" : "Show"} ${row.label}`}
                title={`${visible ? "Hide" : "Show"} ${row.label}`}
                className={`flex w-full items-center justify-between gap-3 rounded-sm border px-2.5 py-2.5 text-left transition-colors duration-150 ${
                  visible
                    ? "border-line-strong bg-surface-raised"
                    : "border-line bg-paper"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 shrink-0 rounded-full ${DOT_TONE[row.key]} ${
                      visible ? "opacity-100" : "opacity-30"
                    }`}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-xs ${
                        visible ? "text-ink" : "text-faint"
                      }`}
                    >
                      {row.label}
                    </span>
                    <span className="data-label block truncate">{row.note}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span
                    className={`font-mono text-sm font-medium ${row.tone} ${
                      visible ? "" : "opacity-40"
                    }`}
                  >
                    {row.value}
                  </span>
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className={`h-3.5 w-3.5 shrink-0 ${
                      visible ? "text-success" : "text-faint"
                    }`}
                    aria-hidden="true"
                  >
                    {visible ? (
                      <>
                        <path d="M1.5 8s2.25-4 6.5-4 6.5 4 6.5 4-2.25 4-6.5 4S1.5 8 1.5 8Z" />
                        <circle cx="8" cy="8" r="1.75" />
                      </>
                    ) : (
                      <path d="M2 2l12 12M6.4 4.2A7.5 7.5 0 0 1 8 4c4.25 0 6.5 4 6.5 4a8.7 8.7 0 0 1-2 2.45M9.6 11.8A7.5 7.5 0 0 1 8 12c-4.25 0-6.5-4-6.5-4a8.7 8.7 0 0 1 2-2.45" />
                    )}
                  </svg>
                </span>
              </button>
            );
          })}
        </div>
      </aside>
    </>
  );
}
