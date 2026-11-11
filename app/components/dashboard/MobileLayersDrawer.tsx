"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Fragment } from "react";
import {
  EyeGlyph,
  LayerFilterInput,
  LayerGroupHeader,
  LayerOptionFilter,
} from "@/app/components/dashboard/LayerControls";
import { useLayerList } from "@/app/hooks/use-layer-list";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";
import type { SensorRow } from "@/app/hooks/use-dashboard-state";
import type { SensorKey } from "@/lib/layers";

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
  const drawerRef = useRef<HTMLElement>(null);

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

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  // Tab stays inside the drawer; the close button keeps the initial focus and
  // the trigger receives it back when the drawer closes.
  useFocusTrap(drawerRef, open, { restoreFocusRef: triggerRef });

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Claim Escape so other document listeners back off.
        event.preventDefault();
        close();
      }
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
        className="absolute left-14 top-11 z-10 flex h-11 w-11 items-center justify-center border border-line bg-overlay sm:left-12 sm:h-9 sm:w-9 text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-surface-hover xl:hidden"
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
        ref={drawerRef}
        id="mobile-layers-drawer"
        inert={!open}
        role="dialog"
        aria-modal={open ? true : undefined}
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
            className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-line bg-paper text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
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

        {/* Filter stays pinned above the scroll area so it never scrolls away. */}
        <div className="p-2 pb-0">
          <LayerFilterInput value={filter} onChange={setFilter} />
        </div>

        <div className="flex-1 overflow-y-auto p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
          <div className="space-y-2">
            {groups.map((group) => (
              <section key={group.id}>
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
                  <div className="mt-1 space-y-1">
                    {group.rows.map((row) => {
                      const visible = sensorVisibility[row.key];
                      return (
                        <Fragment key={row.key}>
                        <button
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
                              className={`h-2 w-2 shrink-0 rounded-full ${row.dot} ${
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
                              <span className="data-label block truncate">
                                {row.note}
                              </span>
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
                            <EyeGlyph
                              visible={visible}
                              className={`h-3.5 w-3.5 shrink-0 ${
                                visible ? "text-success" : "text-faint"
                              }`}
                            />
                          </span>
                        </button>
                        {row.filter && visible ? (
                          <LayerOptionFilter
                            summaryLabel={row.filter.label}
                            options={row.filter.options}
                            selected={row.filter.selected}
                            onChange={row.filter.onChange}
                            accentClass={row.dot}
                          />
                        ) : null}
                        </Fragment>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
            {filterActive && groups.length === 0 ? (
              <div className="px-2.5 py-3 text-[10px] uppercase tracking-[0.1em] text-muted">
                No layers match
              </div>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
