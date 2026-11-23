"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Theme } from "@/lib/theme";

export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  return (
    <span>
      <HeaderChip
        label={now?.toLocaleDateString("en-SG", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Singapore",
        }) ?? "—"}
        value={now?.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore" }) ?? "--:--:--"}
        className="[&>span:first-child]:hidden sm:[&>span:first-child]:inline"
      />
    </span>
  );
}

export function HeaderChip({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 whitespace-nowrap text-muted ${className ?? ""}`}
    >
      <span className="text-faint">{label}</span>
      <span className="font-mono text-ink">{value}</span>
    </span>
  );
}

export function DashboardHeader({
  activeSourceCount,
  notificationBell,
  onToggleTheme,
  onlineSourceCount,
  systemStatus,
  theme,
}: {
  activeSourceCount: number;
  notificationBell: ReactNode;
  onToggleTheme: () => void;
  onlineSourceCount: number;
  systemStatus: string;
  theme: Theme;
}) {
  return (
    <header className="border border-line bg-surface px-3 py-2 sm:px-4 sm:py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex shrink-0 items-center gap-3 sm:min-w-0 sm:shrink">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-[0.16em] text-ink">
              ARGUS
            </div>
            <div className="hidden truncate text-[10px] uppercase tracking-[0.12em] text-muted sm:block">
              Singapore signal monitor
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-x-1.5 text-[10px] uppercase tracking-[0.1em] sm:flex-wrap sm:gap-x-4 sm:gap-y-2">
          <span className="hidden sm:inline">
            <HeaderClock />
          </span>
          <span className="hidden sm:inline">
            <HeaderChip
              label="Sources"
              value={`${onlineSourceCount}/${activeSourceCount}`}
            />
          </span>
          <span
            className={`mr-1 inline-flex items-center gap-1.5 whitespace-nowrap font-semibold sm:mr-0 sm:gap-2 ${
              systemStatus === "Live" ? "text-success" : "text-warning"
            }`}
          >
            <span className="status-dot" aria-hidden="true" />
            {systemStatus}
          </span>
          <button
            type="button"
            onClick={onToggleTheme}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm text-muted transition-colors duration-150 hover:text-ink active:bg-surface-hover sm:h-7 sm:w-7"
          >
            {/* Shows the mode the click switches to: sun in dark, moon in light. */}
            {theme === "dark" ? (
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z" />
              </svg>
            )}
          </button>
          {notificationBell}
        </div>
      </div>
    </header>
  );
}
