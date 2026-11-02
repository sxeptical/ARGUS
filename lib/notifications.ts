/**
 * Decides which signals are worth interrupting for. The diff and selection
 * steps are pure; browser API access is guarded so this is safe to import
 * during server rendering.
 */
import type { SignalCategory, SignalRow } from "@/lib/signals";

export type NotificationPrefs = Readonly<Record<SignalCategory | "browser", boolean>>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  rail: true,
  // Road alerts cover accidents only; other incidents are too frequent.
  road: true,
  weather: true,
  browser: false,
};

/** Signal ids active at the last check. A missing category has no baseline yet. */
export type SeenSignals = Partial<Record<SignalCategory, readonly string[]>>;

/** Whether each category's feed has returned data, as opposed to still being empty. */
export type SignalsLoaded = Readonly<Record<SignalCategory, boolean>>;

/** In priority order: this is the order new signals are shown in. */
const SIGNAL_CATEGORIES: readonly SignalCategory[] = ["rail", "weather", "road"];

const SIGNAL_TITLES: Readonly<Record<SignalCategory, string>> = {
  rail: "Rail disruption",
  road: "Road accident",
  weather: "Unhealthy air quality",
};

const MAX_INDIVIDUAL_BROWSER_NOTIFICATIONS = 3;

export function signalTitle(category: SignalCategory): string {
  return SIGNAL_TITLES[category];
}

/**
 * Compare the current signals with the last seen ids. A category's first load
 * only records a baseline, and a category that hasn't loaded is left alone, so
 * a feed recovering from a failed first request doesn't alert on everything.
 */
export function diffSignals(
  seen: SeenSignals,
  signals: readonly SignalRow[],
  loaded: SignalsLoaded,
): { fresh: SignalRow[]; seen: SeenSignals } {
  const fresh: SignalRow[] = [];
  const nextSeen: SeenSignals = { ...seen };
  for (const category of SIGNAL_CATEGORIES) {
    if (!loaded[category]) continue;
    const rows = new Map(
      signals
        .filter((signal) => signal.category === category)
        .map((signal) => [signal.id, signal]),
    );
    const previous = seen[category];
    if (previous) {
      const known = new Set(previous);
      for (const [id, signal] of rows) {
        if (!known.has(id)) fresh.push(signal);
      }
    }
    nextSeen[category] = [...rows.keys()];
  }
  return { fresh, seen: nextSeen };
}

/**
 * Apply the user's choices to new signals. `scopedIds` holds the signals inside
 * the radius filter, which limits alerts without affecting what counts as new.
 */
export function selectNotifiable(
  fresh: readonly SignalRow[],
  prefs: NotificationPrefs,
  scopedIds: ReadonlySet<string>,
): SignalRow[] {
  return fresh.filter(
    (signal) =>
      prefs[signal.category] &&
      scopedIds.has(signal.id) &&
      (signal.category !== "road" || signal.tone === "danger"),
  );
}

/**
 * Add new signals to a toast or alert list and drop any that have cleared.
 * Returns `current` when nothing changed so React can skip the re-render.
 */
export function mergeActiveSignals(
  current: readonly SignalRow[],
  fresh: readonly SignalRow[],
  activeIds: ReadonlySet<string>,
): readonly SignalRow[] {
  const kept = current.filter((signal) => activeIds.has(signal.id));
  const keptIds = new Set(kept.map((signal) => signal.id));
  const added = fresh.filter((signal) => !keptIds.has(signal.id));
  if (added.length === 0 && kept.length === current.length) return current;
  return [...kept, ...added];
}

export type BrowserNotificationPayload = {
  readonly tag: string;
  readonly title: string;
  readonly body: string;
};

/** Collapse a burst into one summary rather than flooding the notification tray. */
export function buildBrowserNotifications(
  signals: readonly SignalRow[],
): BrowserNotificationPayload[] {
  if (signals.length > MAX_INDIVIDUAL_BROWSER_NOTIFICATIONS) {
    return [
      {
        tag: "argus:signal-summary",
        title: `${signals.length} new ARGUS signals`,
        body: "Open the dashboard to review them.",
      },
    ];
  }
  return signals.map((signal) => ({
    tag: signal.id,
    title: signalTitle(signal.category),
    body: signal.text,
  }));
}

// ---------- Browser Notification API ----------

export type BrowserPermission = NotificationPermission | "unsupported";

export function readBrowserPermission(): BrowserPermission {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return window.Notification.permission;
}

export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (readBrowserPermission() === "unsupported") return "unsupported";
  return window.Notification.requestPermission();
}

export function showBrowserNotification(payload: BrowserNotificationPayload): void {
  if (readBrowserPermission() !== "granted") return;
  try {
    // Tabs alert independently, so the tag stops them duplicating a signal.
    const notification = new window.Notification(payload.title, {
      body: payload.body,
      tag: payload.tag,
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Android Chrome rejects this constructor outside a service worker.
  }
}
