"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readStoredJson, writeStoredJson } from "@/lib/local-history";
import {
  buildBrowserNotifications,
  diffSignals,
  mergeActiveSignals,
  selectNotifiable,
  showBrowserNotification,
  type NotificationPrefs,
  type SeenSignals,
  type SignalsLoaded,
} from "@/lib/notifications";
import type { SignalRow } from "@/lib/signals";
import { parseSeenSignals, SEEN_SIGNALS_KEY } from "@/lib/ui-preferences";

/**
 * Turns polled signals into toasts, the bell's alert list and, while the tab is
 * hidden, browser notifications. `signals` must cover the whole feed so that
 * moving the radius filter can't make existing signals look new; `scopedSignals`
 * is the filtered subset that is allowed to alert.
 */
export function useNotifications({
  signals,
  scopedSignals,
  loaded,
  prefs,
}: {
  signals: readonly SignalRow[];
  scopedSignals: readonly SignalRow[];
  loaded: SignalsLoaded;
  prefs: NotificationPrefs;
}) {
  const [toasts, setToasts] = useState<readonly SignalRow[]>([]);
  // Outlives its toast, so an alert missed while away is still in the bell.
  const [alerts, setAlerts] = useState<readonly SignalRow[]>([]);
  const [unreadIds, setUnreadIds] = useState<ReadonlySet<string>>(new Set());
  const seenRef = useRef<SeenSignals | null>(null);
  const { rail, road, weather } = loaded;

  useEffect(() => {
    if (!rail && !road && !weather) return;
    const timer = window.setTimeout(() => {
      const previous =
        seenRef.current ?? parseSeenSignals(readStoredJson(SEEN_SIGNALS_KEY)) ?? {};
      const { fresh, seen } = diffSignals(previous, signals, { rail, road, weather });
      seenRef.current = seen;
      if (JSON.stringify(seen) !== JSON.stringify(previous)) {
        writeStoredJson(SEEN_SIGNALS_KEY, seen);
      }

      const notifiable = selectNotifiable(
        fresh,
        prefs,
        new Set(scopedSignals.map((signal) => signal.id)),
      );
      const activeIds = new Set(signals.map((signal) => signal.id));
      setToasts((current) => mergeActiveSignals(current, notifiable, activeIds));
      setAlerts((current) => mergeActiveSignals(current, notifiable, activeIds));
      if (notifiable.length > 0) {
        setUnreadIds((current) => new Set([...current, ...notifiable.map((signal) => signal.id)]));
      }
      // A visible tab already shows the toast.
      if (prefs.browser && document.hidden) {
        buildBrowserNotifications(notifiable).forEach(showBrowserNotification);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [signals, scopedSignals, rail, road, weather, prefs]);

  // Timing out only removes the toast; the alert stays unread in the bell.
  const expireToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    setUnreadIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);
  // Every toast is also in the bell's list, so reviewing one clears the other.
  const markAlertsRead = useCallback(() => {
    setToasts([]);
    setUnreadIds(new Set());
  }, []);

  return {
    alerts,
    dismissToast,
    expireToast,
    markAlertsRead,
    toasts,
    unreadCount: alerts.filter((alert) => unreadIds.has(alert.id)).length,
  };
}
