"use client";

import { useEffect, useState } from "react";

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
  onlineSourceCount,
  systemStatus,
}: {
  activeSourceCount: number;
  hasError: boolean;
  onlineSourceCount: number;
  systemStatus: string;
}) {
  return (
    <header className="border border-line bg-surface px-3 py-2 sm:px-4 sm:py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center border border-line-strong bg-ink text-xs font-bold text-paper">
            A
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-[0.16em] text-ink">
              ARGUS
            </div>
            <div className="truncate text-[10px] uppercase tracking-[0.12em] text-muted">
              Singapore signal monitor
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] uppercase tracking-[0.1em]">
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
          <a
            href="https://github.com/sxeptical/ARGUS"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted transition-colors duration-150 hover:text-ink"
          >
            <svg
              viewBox="0 0 16 16"
              fill="currentColor"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            <span>Source</span>
          </a>
        </div>
      </div>
    </header>
  );
}
