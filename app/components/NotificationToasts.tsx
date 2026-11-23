"use client";

import { useEffect } from "react";
import { signalTitle } from "@/lib/notifications";
import type { SignalRow } from "@/lib/signals";

const MAX_VISIBLE_TOASTS = 3;
const ROAD_TOAST_DURATION_MS = 15 * 1000;

function NotificationToast({
  toast,
  onDismiss,
  onExpire,
  className,
}: {
  toast: SignalRow;
  onDismiss: (id: string) => void;
  onExpire: (id: string) => void;
  className?: string;
}) {
  // Rail and air quality toasts stay until dismissed or the signal clears.
  const autoDismiss = toast.category === "road";

  useEffect(() => {
    if (!autoDismiss) return;
    const timer = window.setTimeout(() => onExpire(toast.id), ROAD_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [autoDismiss, onExpire, toast.id]);

  return (
    <div className={`pointer-events-auto flex items-start justify-between gap-3 border border-danger/40 bg-surface-raised p-3 text-ink ${className ?? ""}`}>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-danger">
          {signalTitle(toast)}
        </div>
        <div className="mt-1 break-words text-[11px] leading-relaxed text-muted">
          {toast.text}
        </div>
      </div>
      <button
        type="button"
        className="action-button shrink-0"
        aria-label={`Dismiss ${signalTitle(toast)} notification`}
        onClick={() => onDismiss(toast.id)}
      >
        Dismiss
      </button>
    </div>
  );
}

export default function NotificationToasts({
  toasts,
  onDismiss,
  onDismissAll,
  onExpire,
}: {
  toasts: readonly SignalRow[];
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onExpire: (id: string) => void;
}) {
  const hiddenDesktopCount = toasts.length - MAX_VISIBLE_TOASTS;
  const hiddenMobileCount = toasts.length - 1;

  // Top-right so the stack can't cover UpdateAvailableToast at the bottom. On
  // phones, cap at 1 visible toast so alerts never bury the header and map.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 space-y-2 sm:left-auto sm:right-4 sm:top-16 sm:w-[360px]"
    >
      {toasts.slice(0, MAX_VISIBLE_TOASTS).map((toast, index) => (
        <NotificationToast
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onExpire={onExpire}
          className={index > 0 ? "hidden sm:flex" : undefined}
        />
      ))}
      {hiddenMobileCount > 0 ? (
        <div className="pointer-events-auto flex items-center justify-between gap-3 border border-line-strong bg-surface-raised px-3 py-2 sm:hidden">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            +{hiddenMobileCount} more
          </span>
          <button type="button" className="action-button shrink-0" onClick={onDismissAll}>
            Dismiss All
          </button>
        </div>
      ) : null}
      {hiddenDesktopCount > 0 ? (
        <div className="pointer-events-auto hidden items-center justify-between gap-3 border border-line-strong bg-surface-raised px-3 py-2 sm:flex">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            +{hiddenDesktopCount} more
          </span>
          <button type="button" className="action-button shrink-0" onClick={onDismissAll}>
            Dismiss All
          </button>
        </div>
      ) : null}
    </div>
  );
}
