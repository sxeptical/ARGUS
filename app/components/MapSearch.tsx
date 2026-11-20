"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";
import {
  browseSearchResults,
  countSearchTypes,
  matchSearchResults,
  SEARCH_TYPE_LABEL,
  searchTypeColor,
  type SearchMatch,
} from "@/lib/map-search";
import type { MapSearchResult, SearchResultType } from "@/types";

export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element?.tagName === "INPUT" ||
    element?.tagName === "TEXTAREA" ||
    element?.tagName === "SELECT" ||
    element?.isContentEditable === true
  );
}

const PAGE_SIZE = 40;
const optionId = (index: number) => `map-search-option-${index}`;

type MapSearchProps = {
  results: MapSearchResult[];
  onSelect: (result: MapSearchResult) => void;
  /** Set while a radius filter limits `results`, e.g. "2.5 km radius". */
  scope?: string;
};

function TypeIcon({ type }: { type: SearchResultType }) {
  const color = searchTypeColor(type);
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
      style={{ backgroundColor: `color-mix(in oklch, ${color} 18%, transparent)`, color }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
        {type === "mrt" ? (
          <>
            <rect x="4" y="2" width="8" height="9" rx="2" />
            <path d="M4 7.5h8M6 13.5l-1 1.5M10 13.5l1 1.5M6 9.5h.01M10 9.5h.01" />
          </>
        ) : type === "bus-stop" ? (
          <>
            <rect x="3" y="2" width="10" height="10" rx="1.5" />
            <path d="M3 7h10M5 14v-2M11 14v-2M5.5 9.75h.01M10.5 9.75h.01" />
          </>
        ) : type === "park" ? (
          <path d="M8 14.5V10M8 1.5 3.5 8h2L3 11.5h10L10.5 8h2z" />
        ) : (
          <>
            <path d="M8 14.5s4.5-4.2 4.5-8a4.5 4.5 0 0 0-9 0c0 3.8 4.5 8 4.5 8z" />
            <circle cx="8" cy="6.5" r="1.5" />
          </>
        )}
      </svg>
    </span>
  );
}

/** White on dark line colours, near-black on light ones (LRT grey, CRL lime). */
function badgeTextColor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.55 ? "#111" : "#fff";
}

function HighlightedName({ name, match }: { name: string; match: SearchMatch["nameMatch"] }) {
  if (!match) return <>{name}</>;
  return (
    <>
      {name.slice(0, match.start)}
      <span className="font-semibold text-accent">{name.slice(match.start, match.end)}</span>
      {name.slice(match.end)}
    </>
  );
}

export default function MapSearch({ results, onSelect, scope }: MapSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SearchResultType | null>(null);
  const [active, setActive] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pillRowRef = useRef<HTMLDivElement>(null);
  const [pillOverflow, setPillOverflow] = useState({ left: false, right: false });
  const hasQuery = query.trim() !== "";

  const found = useMemo(
    () => (isOpen && hasQuery ? matchSearchResults(results, query) : []),
    [isOpen, hasQuery, results, query],
  );
  // Before typing, the pills browse whole categories; after, they split the matches.
  const pills = useMemo(
    () => (isOpen ? countSearchTypes(hasQuery ? found : results.map((result) => ({ result }))) : []),
    [isOpen, hasQuery, found, results],
  );
  const matches = useMemo<SearchMatch[]>(() => {
    if (hasQuery) return category ? found.filter(({ result }) => result.type === category) : found;
    return browseSearchResults(results, category).map((result) => ({ result, nameMatch: null }));
  }, [hasQuery, category, found, results]);
  const visible = matches.slice(0, limit);

  function resetList() {
    setActive(0);
    setLimit(PAGE_SIZE);
  }

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setCategory(null);
    setActive(0);
    setLimit(PAGE_SIZE);
  }, []);

  function chooseCategory(type: SearchResultType | null, pill?: HTMLElement) {
    setCategory(type);
    pill?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    resetList();
    inputRef.current?.focus();
  }

  // Focus the input on open, wrap Tab inside the dialog and hand focus back
  // to the search button on close.
  useFocusTrap(panelRef, isOpen, {
    initialFocusRef: inputRef,
    restoreFocusRef: triggerRef,
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Another dialog (e.g. a mall's store directory) owns the keyboard while open.
      const otherDialogOpen = !isOpen && document.querySelector('[aria-modal="true"]') !== null;
      if (!isOpen && event.key.toLowerCase() === "s" && !isTypingTarget(event.target) && !otherDialogOpen &&
        !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        setIsOpen(true);
      } else if (isOpen && event.key === "Escape") {
        // Claim Escape so the radius-picking handler does not also cancel.
        event.preventDefault();
        closeSearch();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (isOpen && !panelRef.current?.contains(event.target as Node)) {
        closeSearch();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen, closeSearch]);

  useEffect(() => {
    if (isOpen) document.getElementById(optionId(active))?.scrollIntoView({ block: "nearest" });
  }, [isOpen, active]);

  const updatePillOverflow = useCallback(() => {
    const row = pillRowRef.current;
    if (!row) return;
    const left = row.scrollLeft > 1;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    setPillOverflow((current) => (current.left === left && current.right === right ? current : { left, right }));
  }, []);

  // The pill row hides its scrollbar, so a mouse wheel scrolls it sideways and
  // arrows at the edges show there is more.
  const hasPills = pills.length > 0;
  useEffect(() => {
    const row = pillRowRef.current;
    if (!isOpen || !row) return;
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || row.scrollWidth <= row.clientWidth) return;
      event.preventDefault();
      row.scrollLeft += event.deltaY;
    };
    const observer = new ResizeObserver(updatePillOverflow);
    observer.observe(row);
    updatePillOverflow();
    row.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      observer.disconnect();
      row.removeEventListener("wheel", handleWheel);
    };
  }, [isOpen, hasPills, updatePillOverflow]);

  useEffect(updatePillOverflow, [pills, updatePillOverflow]);

  const scrollPills = (direction: -1 | 1) => {
    const row = pillRowRef.current;
    row?.scrollBy({ left: direction * row.clientWidth * 0.7, behavior: "smooth" });
  };

  const selectResult = (result: MapSearchResult) => {
    onSelect(result);
    closeSearch();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && visible.length > 0) {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, visible.length - 1));
    } else if (event.key === "ArrowUp" && visible.length > 0) {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && visible[active]) {
      event.preventDefault();
      selectResult(visible[active].result);
    } else if (event.key === "Backspace" && query === "" && category) {
      chooseCategory(null);
    }
  };

  const pillClass = (selected: boolean) =>
    `shrink-0 rounded-full border px-3 py-1 text-xs transition-colors duration-150 ${selected
      ? "border-line-strong bg-surface-hover text-ink"
      : "border-transparent bg-surface-raised text-muted hover:text-ink"}`;
  const emptyText = results.length === 0 && !scope
    ? "Turn on a map layer to search its places"
    : scope ? `No locations found within ${scope}` : "No locations found";

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Search map locations"
        title="Search (S)"
        className="absolute left-2 top-11 z-10 grid h-11 w-11 place-items-center border border-line bg-overlay text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-surface-hover sm:h-9 sm:w-9"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
      </button>
      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-scrim p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] sm:p-4 sm:pt-[15vh] backdrop-blur-[2px]"
          onClick={closeSearch}
          role="presentation"
        >
          <div
            ref={panelRef}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-elevation"
            role="dialog"
            aria-modal="true"
            aria-label="Search map locations"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0 text-muted" aria-hidden="true">
                <circle cx="7" cy="7" r="4.5" />
                <path d="M10.5 10.5 14 14" />
              </svg>
              <div className="min-w-0 flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  enterKeyHint="search"
                  autoComplete="off"
                  spellCheck={false}
                  role="combobox"
                  aria-label="Search map locations"
                  aria-expanded={visible.length > 0}
                  aria-controls="map-search-results"
                  aria-autocomplete="list"
                  aria-activedescendant={visible[active] ? optionId(active) : undefined}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    resetList();
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder={scope ? `Search within ${scope}` : "Search stations, stops, parks and places"}
                  className="w-full bg-transparent text-xl text-ink outline-none placeholder:text-faint"
                  // The global focus ring would box the field; the open palette already shows where typing goes.
                  style={{ outline: "none" }}
                />
              </div>
            </div>
            {hasPills ? (
              <div className="relative border-t border-line">
                {pillOverflow.left ? (
                  <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => scrollPills(-1)}
                    className="absolute inset-y-0 left-0 z-10 grid w-12 place-items-center justify-start pl-2 text-muted hover:text-ink"
                    style={{ background: "linear-gradient(to right, var(--color-surface) 55%, transparent)" }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
                  </button>
                ) : null}
                {pillOverflow.right ? (
                  <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => scrollPills(1)}
                    className="absolute inset-y-0 right-0 z-10 grid w-12 place-items-center justify-end pr-2 text-muted hover:text-ink"
                    style={{ background: "linear-gradient(to left, var(--color-surface) 55%, transparent)" }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
                  </button>
                ) : null}
                <div
                  ref={pillRowRef}
                  onScroll={updatePillOverflow}
                  className="flex gap-2 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                  role="group"
                  aria-label="Filter by category"
                >
                  <button type="button" className={pillClass(category === null)} aria-pressed={category === null}
                    onClick={(event) => chooseCategory(null, event.currentTarget)}>
                    All
                  </button>
                  {pills.map(({ type, count }) => (
                    <button key={type} type="button" className={pillClass(category === type)} aria-pressed={category === type}
                      onClick={(event) => chooseCategory(category === type ? null : type, event.currentTarget)}>
                      {SEARCH_TYPE_LABEL[type]}
                      {hasQuery ? <span className="ml-1.5 tabular-nums text-faint">{count}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="max-h-[min(55vh,26rem)] overflow-y-auto border-t border-line p-2">
              <p role="status" className="sr-only">
                {matches.length} {matches.length === 1 ? "match" : "matches"}
              </p>
              {visible.length > 0 ? (
                <ul id="map-search-results" role="listbox" aria-label="Search results">
                  {visible.map(({ result, nameMatch }, index) => (
                    <li
                      key={`${result.type}-${result.id}`}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      onMouseMove={() => setActive(index)}
                      onClick={() => selectResult(result)}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${index === active ? "bg-surface-hover" : ""}`}
                    >
                      <TypeIcon type={result.type} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">
                          <HighlightedName name={result.name} match={nameMatch} />
                        </div>
                        {result.badges ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {result.badges.map((badge) => (
                              <span key={badge.label}
                                className="rounded px-1.5 py-px text-[10px] font-semibold leading-4 tracking-wide"
                                style={{ backgroundColor: badge.color, color: badgeTextColor(badge.color) }}>
                                {badge.label}
                              </span>
                            ))}
                          </div>
                        ) : result.detail ? (
                          <div className="truncate text-xs text-muted">{result.detail}</div>
                        ) : null}
                      </div>
                      {index === active ? (
                        <span className="hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-faint sm:inline">
                          Go to ↵
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-3 py-6 text-center text-[10px] uppercase tracking-[0.1em] text-muted">
                  {emptyText}
                </div>
              )}
              {matches.length > limit && (
                <button type="button" className="action-button mt-2 w-full"
                  onClick={() => setLimit((current) => current + PAGE_SIZE)}>
                  Show {Math.min(PAGE_SIZE, matches.length - limit)} more of {matches.length - limit}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
