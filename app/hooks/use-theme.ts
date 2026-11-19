"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readStoredJson, writeStoredJson } from "@/lib/local-history";
import { parseTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

/** Dispatched in this tab after a toggle; other tabs hear the storage event. */
const THEME_EVENT = "argus:theme-change";

/**
 * The document's data-theme attribute is the source of truth: the layout's
 * inline script applies it before first paint, and this hook reads it through
 * useSyncExternalStore so hydration stays safe (the server snapshot is the
 * dark default) and every mounted consumer updates on a toggle.
 */
function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

function subscribe(callback: () => void) {
  const onThemeChange = () => callback();
  // A storage event fires in *other* tabs when this tab writes; it does not
  // touch this document's attribute, so mirror the stored theme into the
  // document before React re-reads the snapshot above.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== THEME_STORAGE_KEY) return;
    const stored = parseTheme(readStoredJson(THEME_STORAGE_KEY));
    if (stored) document.documentElement.dataset.theme = stored;
    callback();
  };
  window.addEventListener(THEME_EVENT, onThemeChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(THEME_EVENT, onThemeChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function useTheme(): readonly [Theme, () => void] {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleTheme = useCallback(() => {
    const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
    writeStoredJson(THEME_STORAGE_KEY, next);
    document.documentElement.dataset.theme = next;
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return [theme, toggleTheme] as const;
}
