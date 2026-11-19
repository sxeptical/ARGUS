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
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[10px] sm:gap-x-4 sm:gap-y-2 uppercase tracking-[0.1em]">
          <HeaderClock />
          <HeaderChip
            label="Sources"
            value={`${onlineSourceCount}/${activeSourceCount}`}
          />
          <span
            className={`inline-flex items-center gap-2 whitespace-nowrap font-semibold ${
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
            className="whitespace-nowrap border border-line px-2 py-1 font-semibold text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          {notificationBell}
        </div>
      </div>
    </header>
  );
}
