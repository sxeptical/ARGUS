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
  const [availableVersion, setAvailableVersion] = useState<string | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);

  const checkForUpdate = useCallback(async () => {
    const latestVersion = await fetchDeploymentVersion();
    if (!latestVersion) return;

    if (initialVersionRef.current === null) {
      initialVersionRef.current = latestVersion;
      return;
    }

    if (
      latestVersion !== initialVersionRef.current &&
      latestVersion !== dismissedVersion
    ) {
      setAvailableVersion(latestVersion);
    }
  }, [dismissedVersion]);

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
    <div className="fixed bottom-4 right-4 z-50 w-[min(92vw,360px)] rounded-md border border-cyan-300/40 bg-[#04111e]/95 p-3 text-terminal-text shadow-[0_0_34px_rgba(63,211,255,0.22)] backdrop-blur-md">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="[font-family:var(--font-rajdhani)] text-sm font-semibold uppercase tracking-[0.18em] text-[#8ccff0]">
            Update Available
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-[#9ec7df]">
            A newer ARGUS build is live. Refresh to load version {shortVersion(availableVersion)}.
          </div>
        </div>
        <button
          type="button"
          className="rounded-sm border border-terminal-border/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-[#7ea9c2] transition-colors hover:border-cyan-300/60 hover:text-cyan-100"
          onClick={() => {
            setDismissedVersion(availableVersion);
            setAvailableVersion(null);
          }}
        >
          Later
        </button>
      </div>

      <button
        type="button"
        className="w-full rounded-sm border border-[#35f0ce]/45 bg-[#35f0ce]/12 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b8fff1] transition-colors hover:bg-[#35f0ce]/20"
        onClick={() => window.location.reload()}
      >
        Refresh Dashboard
      </button>
    </div>
  );
}
