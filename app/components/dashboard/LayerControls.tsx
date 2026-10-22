"use client";

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
        className="flex min-w-0 items-center gap-1.5 text-left text-[13px] font-semibold uppercase tracking-[0.12em] text-ink transition-colors duration-150 hover:text-muted"
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

/** Compact filter box for the layer list; matches panel density. */
export function LayerFilterInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
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
        placeholder="Filter layers…"
        aria-label="Filter layers"
        className="min-w-0 flex-1 bg-transparent text-xs text-ink outline-none placeholder:text-muted"
      />
    </div>
  );
}
