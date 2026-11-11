"use client";

import { useState } from "react";
import {
  allLayerOptionsOn,
  toggleLayerOptionSelection,
} from "@/lib/layers";

/**
 * Small shared pieces of the layer UI (group header, filter input, eye
 * glyphs) used by both the desktop LayersSidebar and the MobileLayersDrawer,
 * so the two surfaces look and behave identically.
 */

/** Open/closed eye glyph shared by layer rows, group headers and the drawer. */
export function EyeGlyph({
  visible,
  className = "h-3 w-3",
}: {
  visible: boolean;
  className?: string;
}) {
  return visible ? (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M1.5 8s2.25-4 6.5-4 6.5 4 6.5 4-2.25 4-6.5 4S1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="1.75" />
    </svg>
  ) : (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 2l12 12M6.4 4.2A7.5 7.5 0 0 1 8 4c4.25 0 6.5 4 6.5 4a8.7 8.7 0 0 1-2 2.45M9.6 11.8A7.5 7.5 0 0 1 8 12c-4.25 0-6.5-4-6.5-4a8.7 8.7 0 0 1 2-2.45" />
    </svg>
  );
}

/**
 * Collapsible group header: click the label to fold the group, click the eye
 * to flip every layer in it.
 */
export function LayerGroupHeader({
  label,
  visibleCount,
  totalCount,
  collapsed,
  anyVisible,
  onToggleCollapsed,
  onToggleVisible,
}: {
  label: string;
  visibleCount: number;
  totalCount: number;
  collapsed: boolean;
  anyVisible: boolean;
  onToggleCollapsed: () => void;
  onToggleVisible: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line px-2.5 py-1.5">
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} ${label} layers`}
        className="flex min-w-0 items-center gap-1.5 text-left text-[8px] font-semibold uppercase tracking-[0.12em] text-ink transition-colors duration-150 hover:text-muted"
      >
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className={`h-3 w-3 shrink-0 transition-transform duration-150 ${
            collapsed ? "" : "rotate-90"
          }`}
          aria-hidden="true"
        >
          <path d="M6 4l4 4-4 4" />
        </svg>
        <span className="truncate">{label}</span>
      </button>
      <div className="flex shrink-0 items-center gap-2">
        <span className="font-mono text-[9px] text-muted">
          {visibleCount}/{totalCount}
        </span>
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={`${anyVisible ? "Hide" : "Show"} all ${label} layers`}
          title={`${anyVisible ? "Hide" : "Show"} all ${label} layers`}
          aria-pressed={anyVisible}
          className={`grid h-5 w-5 place-items-center rounded-full border transition-colors duration-150 ${
            anyVisible
              ? "border-success/45 bg-success/8 text-success hover:bg-success/12"
              : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink"
          }`}
        >
          <EyeGlyph visible={anyVisible} className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
}

/** Compact filter box for the layer list (and other panel lists); matches panel density. */
export function LayerFilterInput({
  value,
  onChange,
  placeholder = "Filter layers…",
  label = "Filter layers",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-sm border border-line bg-paper px-2.5 py-1.5">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-3 w-3 shrink-0 text-muted"
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="M10.5 10.5 14 14" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}

/** First N options shown in a sub-filter; the rest wait behind "+N more". */
const SUB_FILTER_TOP_COUNT = 6;

/**
 * Collapsed-by-default sub-filter under a layer row (e.g. gym operator
 * brands). Generic over any layer's options-with-counts: the summary line
 * (`Brands: All`, `Brands: Anytime Fitness, ActiveSG`, `Brands: 3 selected`)
 * expands to multi-select chips where the first tap solos an option and
 * deselecting the last one reverts to all. Selection is a Record like layer
 * visibility, so it persists the same way.
 */
export function LayerOptionFilter({
  summaryLabel,
  options,
  selected,
  onChange,
  accentClass,
}: {
  /** Short name, e.g. "Brands"; prefixes the summary line and aria labels. */
  summaryLabel: string;
  options: ReadonlyArray<{ value: string; label: string; count: number }>;
  selected: Readonly<Record<string, boolean>>;
  onChange: (next: Record<string, boolean>) => void;
  /** Classes for a selected chip (filled layer colour). */
  accentClass: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const allValues = options.map((option) => option.value);
  const onOptions = options.filter((option) => selected[option.value] !== false);
  const allOn = onOptions.length === allValues.length;
  const summary = allOn
    ? "All"
    : onOptions.length <= 2
      ? onOptions.map((option) => option.label).join(", ")
      : `${onOptions.length} selected`;
  const shown = showAll ? options : options.slice(0, SUB_FILTER_TOP_COUNT);
  const overflow = options.slice(SUB_FILTER_TOP_COUNT);

  return (
    <div className="data-row px-2.5 py-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} ${summaryLabel.toLowerCase()} filter`}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0 truncate text-xs text-ink">
          <span className="data-label mr-2">{summaryLabel}</span>
          {summary}
        </span>
        <span aria-hidden="true" className={`shrink-0 text-muted transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {expanded ? (
        <div className="flex flex-wrap gap-1 pt-2">
          <button
            type="button"
            onClick={() => onChange(allLayerOptionsOn(allValues))}
            aria-pressed={allOn}
            aria-label={`Show all ${summaryLabel.toLowerCase()}`}
            className={`flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors duration-150 ${
              allOn ? `${accentClass} border-transparent text-paper` : "border-line bg-paper text-muted hover:text-ink"
            }`}
          >
            All
          </button>
          {shown.map((option) => {
            const on = selected[option.value] !== false;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(toggleLayerOptionSelection(selected, option.value, allValues))}
                aria-pressed={on}
                aria-label={`${on ? "Hide" : "Show"} ${option.label} ${summaryLabel.toLowerCase()} (${option.count})`}
                title={`${option.label} (${option.count})`}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] transition-colors duration-150 ${
                  on ? `${accentClass} border-transparent text-paper` : "border-line bg-paper text-faint"
                }`}
              >
                <span>{option.label}</span>
                <span className={`font-mono text-[9px] ${on ? "text-paper/70" : "text-muted"}`}>{option.count}</span>
              </button>
            );
          })}
          {!showAll && overflow.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              aria-expanded={showAll}
              aria-label={`Show ${overflow.length} more ${summaryLabel.toLowerCase()}`}
              className="rounded-full border border-line bg-paper px-2 py-0.5 text-[10px] text-muted transition-colors duration-150 hover:text-ink"
            >
              +{overflow.length} more
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
