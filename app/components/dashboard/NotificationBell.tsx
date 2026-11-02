"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { IntelPanel } from "@/app/components/dashboard/IntelPanel";
import {
  readBrowserPermission,
  requestBrowserPermission,
  signalTitle,
  type BrowserPermission,
  type NotificationPrefs,
} from "@/lib/notifications";
import type { SignalRow } from "@/lib/signals";

const BUTTON_CLASS =
  "inline-flex min-h-7 min-w-11 shrink-0 items-center justify-center whitespace-nowrap border px-2.5 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-40";

const CATEGORY_ROWS = [
  { key: "rail", label: "Rail disruptions" },
  { key: "road", label: "Road accidents" },
  { key: "weather", label: "Unhealthy air (PSI above 100)" },
] as const;

function browserNote(permission: BrowserPermission): string {
  if (permission === "unsupported") return "Not supported in this browser.";
  if (permission === "denied") return "Blocked in your browser settings.";
  return "Alerts while this tab is in the background. Stops when the tab closes.";
}

function ToggleRow({
  label,
  note,
  on,
  disabled,
  onToggle,
}: {
  label: string;
  note?: string;
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-1 py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div className="text-[11px] text-ink">{label}</div>
        {note ? <div className="mt-0.5 text-[10px] leading-relaxed text-muted">{note}</div> : null}
      </div>
      <button
        type="button"
        aria-label={label}
        aria-pressed={on}
        disabled={disabled}
        onClick={onToggle}
        className={`${BUTTON_CLASS} ${
          on
            ? "border-ink bg-ink text-paper"
            : "border-line text-muted enabled:hover:border-line-strong enabled:hover:text-ink"
        }`}
      >
        {on ? "On" : "Off"}
      </button>
    </div>
  );
}

function NotificationSettings({
  prefs,
  setPrefs,
}: {
  prefs: NotificationPrefs;
  setPrefs: Dispatch<SetStateAction<NotificationPrefs>>;
}) {
  // Only mounted once the bell is opened, so this never runs during server
  // rendering and picks up changes made in the browser's own settings.
  const [permission, setPermission] = useState(readBrowserPermission);
  const browserOn = prefs.browser && permission === "granted";

  const toggleBrowser = async () => {
    if (browserOn) {
      setPrefs((previous) => ({ ...previous, browser: false }));
      return;
    }
    // Browsers require this prompt to come from a user gesture.
    const next = await requestBrowserPermission();
    setPermission(next);
    if (next === "granted") {
      setPrefs((previous) => ({ ...previous, browser: true }));
    }
  };

  return (
    <>
      {CATEGORY_ROWS.map((row) => (
        <ToggleRow
          key={row.key}
          label={row.label}
          on={prefs[row.key]}
          onToggle={() =>
            setPrefs((previous) => ({ ...previous, [row.key]: !previous[row.key] }))
          }
        />
      ))}
      <ToggleRow
        label="Browser alerts"
        note={browserNote(permission)}
        on={browserOn}
        disabled={permission === "unsupported" || permission === "denied"}
        onToggle={() => void toggleBrowser()}
      />
    </>
  );
}

export function NotificationBell({
  alerts,
  unreadCount,
  onMarkRead,
  prefs,
  setPrefs,
}: {
  alerts: readonly SignalRow[];
  unreadCount: number;
  onMarkRead: () => void;
  prefs: NotificationPrefs;
  setPrefs: Dispatch<SetStateAction<NotificationPrefs>>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Alerts that arrive while open have been seen too, so closing also marks read.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      onMarkRead();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onMarkRead]);

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(!open);
          onMarkRead();
        }}
        className={`relative inline-flex h-7 w-7 items-center justify-center transition-colors duration-150 hover:text-ink ${
          open ? "text-ink" : "text-muted"
        }`}
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M8 16a2 2 0 001.985-1.75c.017-.137-.097-.25-.235-.25h-3.5c-.138 0-.252.113-.235.25A2 2 0 008 16zM3 5a5 5 0 0110 0v2.947c0 .05.015.098.042.139l1.703 2.555A1.519 1.519 0 0113.482 13H2.518a1.516 1.516 0 01-1.263-2.36l1.703-2.554A.255.255 0 003 7.947V5z" />
        </svg>
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center bg-danger px-0.5 font-mono text-[9px] font-semibold leading-none tracking-normal text-paper"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        // The header's uppercase tracking would otherwise inherit into this.
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[70dvh] w-[320px] max-w-[calc(100vw-1.5rem)] overflow-y-auto border border-line-strong bg-surface text-left normal-case tracking-normal"
        >
          <IntelPanel title="Notifications" badge={`${alerts.length} active`}>
            {alerts.length > 0 ? (
              <div className="mb-2 border-b border-line">
                {alerts.map((alert) => (
                  <div key={alert.id} className="border-b border-line px-1 py-1.5 last:border-b-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-danger">
                      {signalTitle(alert.category)}
                    </div>
                    <div className="mt-0.5 break-words text-[11px] leading-relaxed text-muted">
                      {alert.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mb-2 border-b border-line px-1 pb-2 text-xs leading-relaxed text-muted">
                No new alerts since you opened ARGUS.
              </div>
            )}
            <NotificationSettings prefs={prefs} setPrefs={setPrefs} />
          </IntelPanel>
        </div>
      ) : null}
    </div>
  );
}
