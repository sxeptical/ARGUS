"use client";

import { useEffect, useState } from "react";
import type { SourceState } from "@/app/hooks/use-dashboard-sources";

export function LoadingScreen({
  sources,
}: {
  sources: ReadonlyArray<SourceState>;
}) {
  const [bootTime] = useState(() => new Date());
  // Latch after 8s so partial-failure help text shows even when the rest
  // of the screen content is otherwise static. Single timeout, no interval,
  // so we only re-render once.
  const [helpReady, setHelpReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setHelpReady(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const enabledSources = sources.filter(
    (source) => source.message !== "disabled",
  );
  const totalSources = enabledSources.length;
  const okCount = enabledSources.filter((s) => s.status === "ok").length;
  const errorCount = enabledSources.filter((s) => s.status === "error").length;
  const settledCount = enabledSources.filter(
    (s) => s.status === "ok" || s.status === "error",
  ).length;
  const progress = totalSources === 0 ? 0 : (settledCount / totalSources) * 100;
  const allSettled = settledCount === totalSources;
  const allOk = allSettled && errorCount === 0;
  const allFailed = allSettled && okCount === 0;
  const partial = allSettled && !allOk && !allFailed;

  const headline = allOk
    ? "System ready."
    : allFailed
      ? "Offline — no data sources responded."
      : partial
        ? `Partial signal — ${okCount}/${totalSources} sources online.`
        : "Connecting to data sources...";

  const headlineTone = allOk
    ? "text-success"
    : allFailed
      ? "text-danger"
      : partial
        ? "text-warning"
        : "text-ink";

  const showOfflineHelp =
    allFailed || (settledCount > 0 && errorCount > 0 && helpReady);

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-8 text-ink">
      <div className="w-full max-w-2xl border border-line bg-surface p-4 sm:p-6">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center border border-line-strong bg-ink text-xs font-bold text-paper">
              A
            </div>
            <div>
              <div className="text-sm font-semibold tracking-[0.16em]">
                ARGUS
              </div>
              <div className="data-label mt-0.5">
                {allFailed ? "Connection failed" : "Connecting sources"}
              </div>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="data-label">Started</div>
            <div
              className="mt-1 font-mono text-[11px] text-muted"
              suppressHydrationWarning
            >
              {bootTime.toLocaleTimeString("en-SG", {
                timeZone: "Asia/Singapore",
              })}
            </div>
          </div>
        </div>

        <div aria-live="polite">
          <div className="mb-2 flex items-end justify-between gap-4">
            <div>
              <div className={`text-sm font-medium ${headlineTone}`}>
                {headline}
              </div>
              <div className="mt-1 text-xs text-muted">
                {okCount} of {totalSources} sources online
                {errorCount > 0 ? ` · ${errorCount} failed` : ""}
              </div>
            </div>
            <div className="font-mono text-sm text-ink">
              {Math.min(Math.round(progress), 100)}%
            </div>
          </div>
          <div
            className="h-1 w-full bg-line"
            role="progressbar"
            aria-label="Data source connection progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(Math.round(progress), 100)}
          >
            <div
              className={`h-full ${
                allFailed
                  ? "bg-danger"
                  : partial
                    ? "bg-warning"
                    : "bg-ink"
              }`}
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        {showOfflineHelp && (
          <div className="mt-5 border-l border-warning pl-3 text-xs leading-relaxed text-muted">
            <div className="mb-1 font-medium text-ink">
              {allFailed ? "All sources unreachable" : "Some sources unreachable"}
            </div>
            <div>
              {allFailed
                ? "The dashboard could not reach any of the data APIs. Check that the server is running and that the API routes are responding. The dashboard will keep retrying every few seconds."
                : "One or more data sources are not responding. The dashboard will retry them on the next refresh. The signals that loaded successfully are still live."}
            </div>
          </div>
        )}

        <div className="mt-8 grid border-t border-line sm:grid-cols-5">
          {sources.map((source) => {
            const isDisabled = source.message === "disabled";
            const isOk = source.status === "ok";
            const isError = source.status === "error";
            const isLoading = source.status === "loading";
            const dotClass = isDisabled
              ? "text-faint"
              : isOk
                ? "text-success"
                : isError
                  ? "text-danger"
                  : isLoading
                    ? "text-info"
                    : "text-faint";
            const statusLabel = isDisabled
              ? "Disabled"
              : isOk
                ? "Online"
                : isError
                  ? "Offline"
                  : isLoading
                    ? "Syncing..."
                    : "Queued";
            const statusClass = isDisabled
              ? "text-faint"
              : isOk
                ? "text-success"
                : isError
                  ? "text-danger"
                  : isLoading
                    ? "text-info"
                    : "text-faint";
            return (
              <div
                key={source.label}
                className="border-b border-line p-3 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
              >
                <div className={`mb-2 flex items-center gap-2 ${dotClass}`}>
                  <span className="status-dot" aria-hidden="true" />
                </div>
                <div className="text-[10px] font-medium text-ink">
                  <span>{source.label}</span>
                </div>
                <div className="mt-1 text-[9px] uppercase tracking-[0.1em]">
                  <span className={statusClass}>{statusLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
