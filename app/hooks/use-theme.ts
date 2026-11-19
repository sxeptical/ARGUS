"use client";

import { useCallback, useSyncExternalStore } from "react";
import { writeStoredJson } from "@/lib/local-history";
import { THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

/** Toggled here; other tabs announce changes through the storage event. */
const THEME_EVENT = "argus:theme-change";

/**
 * The document's data-theme attribute is the source of truth: the layout's
 * inline script applies it before first paint, and this hook reads it through
 * useSyncExternalStore so hydration stays safe (the server snapshot is the
 * dark default) and every mounted consumer updates on a toggle.
 */
function subscribe(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
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
