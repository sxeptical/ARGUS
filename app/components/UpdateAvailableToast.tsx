"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const VERSION_CHECK_INTERVAL_MS = 60 * 1000;

type VersionResponse = {
  version?: unknown;
};

async function fetchDeploymentVersion(): Promise<string | null> {
  try {
    const response = await fetch("/api/version", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = (await response.json()) as VersionResponse;
    return typeof payload.version === "string" && payload.version.trim()
      ? payload.version.trim()
      : null;
  } catch {
    return null;
  }
}

function shortVersion(version: string): string {
  return version.length > 12 ? version.slice(0, 7) : version;
}

export default function UpdateAvailableToast() {
  const initialVersionRef = useRef<string | null>(null);
  const dismissedVersionRef = useRef<string | null>(null);
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    const latestVersion = await fetchDeploymentVersion();
    if (!latestVersion) return;

    if (initialVersionRef.current === null) {
      initialVersionRef.current = latestVersion;
      return;
    }

    if (
      latestVersion !== initialVersionRef.current &&
      latestVersion !== dismissedVersionRef.current
    ) {
      setAvailableVersion(latestVersion);
    }
  }, []);

  useEffect(() => {
    void checkForUpdate();

    const interval = window.setInterval(() => {
      void checkForUpdate();
    }, VERSION_CHECK_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void checkForUpdate();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkForUpdate]);

  if (!availableVersion) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 border border-line-strong bg-surface-raised p-3 text-ink sm:right-4 sm:left-auto sm:bottom-4 sm:w-[360px]">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
            Update Available
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-muted">
            A newer ARGUS build is live. Refresh to load version{" "}
            {shortVersion(availableVersion)}.
          </div>
        </div>
        <button
          type="button"
          className="action-button shrink-0"
          onClick={() => {
            dismissedVersionRef.current = availableVersion;
            setAvailableVersion(null);
          }}
        >
          Later
        </button>
      </div>

      <button
        type="button"
        className="action-button action-button-primary w-full"
        onClick={() => window.location.reload()}
      >
        Refresh Dashboard
      </button>
    </div>
  );
}
