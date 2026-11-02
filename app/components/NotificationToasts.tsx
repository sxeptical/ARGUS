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
}: {
  toast: SignalRow;
  onDismiss: (id: string) => void;
  onExpire: (id: string) => void;
}) {
  // Rail and air quality toasts stay until dismissed or the signal clears.
  const autoDismiss = toast.category === "road";

  useEffect(() => {
    if (!autoDismiss) return;
    const timer = window.setTimeout(() => onExpire(toast.id), ROAD_TOAST_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [autoDismiss, onExpire, toast.id]);

  return (
    <div className="pointer-events-auto flex items-start justify-between gap-3 border border-danger/40 bg-surface-raised p-3 text-ink">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-danger">
          {signalTitle(toast.category)}
        </div>
        <div className="mt-1 break-words text-[11px] leading-relaxed text-muted">
          {toast.text}
        </div>
      </div>
      <button
        type="button"
        className="action-button shrink-0"
        aria-label={`Dismiss ${signalTitle(toast.category)} notification`}
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
  const hiddenCount = toasts.length - MAX_VISIBLE_TOASTS;

  // Top-right so the stack can't cover UpdateAvailableToast at the bottom. The
  // live region stays mounted while empty so screen readers announce additions.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-[calc(env(safe-area-inset-top)+0.75rem)] z-50 space-y-2 sm:left-auto sm:right-4 sm:top-16 sm:w-[360px]"
    >
      {toasts.slice(0, MAX_VISIBLE_TOASTS).map((toast) => (
        <NotificationToast key={toast.id} toast={toast} onDismiss={onDismiss} onExpire={onExpire} />
      ))}
      {hiddenCount > 0 ? (
        <div className="pointer-events-auto flex items-center justify-between gap-3 border border-line-strong bg-surface-raised px-3 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            +{hiddenCount} more
          </span>
          <button type="button" className="action-button shrink-0" onClick={onDismissAll}>
            Dismiss All
          </button>
        </div>
      ) : null}
    </div>
  );
}
