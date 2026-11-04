"use client";

import { useEffect, useState, type ReactNode } from "react";

export function HeaderClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  return (
    <span suppressHydrationWarning>
      <HeaderChip
        label={now.toLocaleDateString("en-SG", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "Asia/Singapore",
        })}
        value={now.toLocaleTimeString("en-SG", { timeZone: "Asia/Singapore" })}
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
  hasError,
  notificationBell,
  onlineSourceCount,
  systemStatus,
}: {
  activeSourceCount: number;
  hasError: boolean;
  notificationBell: ReactNode;
  onlineSourceCount: number;
  systemStatus: string;
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
              hasError ? "text-warning" : "text-success"
            }`}
          >
            <span className="status-dot" aria-hidden="true" />
            {systemStatus}
          </span>
          {notificationBell}
        </div>
      </div>
    </header>
  );
}
