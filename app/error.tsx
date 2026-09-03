"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard error", error.digest ?? "", error);
  }, [error]);
  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 text-ink">
      <div className="w-full max-w-md border border-line bg-surface p-6 sm:p-8">
        <div className="mb-5 flex items-center gap-2 text-danger">
          <span className="status-dot" aria-hidden="true" />
          <span className="data-label text-danger">System error</span>
        </div>
        <h1 className="mb-2 text-xl font-semibold">Dashboard unavailable</h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          A rendering error interrupted the signal monitor.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="action-button action-button-primary"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
