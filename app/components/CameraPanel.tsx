import type { SourceStatus } from "@/app/hooks/use-dashboard-sources";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import TerminalPanel from "@/app/components/TerminalPanel";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";
import {
  CAMERA_GROUP_LABEL,
  CAMERA_GROUP_ORDER,
  cameraGroup,
  formatCameraDistance,
  pairCamerasWithIncidents,
  type CameraGroup,
} from "@/lib/cameras";
import { googleMapsUrl } from "@/lib/maps-links";
import type { TrafficCamera, TrafficIncident } from "@/types";

type CameraFilter = "all" | "incidents" | CameraGroup;

const INITIAL_CAMERA_LIMIT = 8;

type CameraPanelProps = {
  feedStatus: SourceStatus;
  cameras: TrafficCamera[];
  incidents?: TrafficIncident[];
  selectedCamera: TrafficCamera | null;
};

const EMPTY_INCIDENTS: TrafficIncident[] = [];

const CHIP_CLASS =
  "inline-flex min-h-6 shrink-0 items-center gap-1 whitespace-nowrap border px-2 font-mono text-[10px] uppercase tracking-[0.06em] transition-colors duration-150";

export default function CameraPanel({
  feedStatus,
  cameras,
  incidents = EMPTY_INCIDENTS,
  selectedCamera,
}: CameraPanelProps) {
  const [expanded, setExpanded] = useState<TrafficCamera | null>(null);
  const [filter, setFilter] = useState<CameraFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const closeModal = useCallback(() => {
    setExpanded(null);
  }, []);

  // Focus the close button on open, trap Tab inside the dialog and restore
  // focus to the camera thumbnail on close.
  useFocusTrap(dialogRef, expanded !== null, {
    initialFocusRef: closeButtonRef,
  });

  useEffect(() => {
    if (!expanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Claim Escape so the radius-picking handler does not also cancel.
      event.preventDefault();
      closeModal();
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [expanded, closeModal]);

  const incidentByCamera = useMemo(
    () => pairCamerasWithIncidents(cameras, incidents),
    [cameras, incidents],
  );

  const groupCounts = useMemo(() => {
    const counts = new Map<CameraGroup, number>();
    for (const camera of cameras) {
      const group = cameraGroup(camera.CameraID);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
    return CAMERA_GROUP_ORDER.flatMap((group) => {
      const count = counts.get(group) ?? 0;
      return count > 0 ? [{ group, count }] : [];
    });
  }, [cameras]);

  const incidentCount = incidentByCamera.size;
  const availableFilters = useMemo(() => {
    const set = new Set<CameraFilter>(["all"]);
    if (incidentCount > 0) set.add("incidents");
    for (const { group } of groupCounts) set.add(group);
    return set;
  }, [groupCounts, incidentCount]);

  // Fall back to "all" if the active filter disappears (e.g. incident clears).
  const effectiveFilter: CameraFilter = availableFilters.has(filter)
    ? filter
    : "all";

  const filteredCameras = useMemo(() => {
    let list: TrafficCamera[];
    if (effectiveFilter === "incidents") {
      list = cameras
        .filter((camera) => incidentByCamera.has(camera.CameraID))
        .sort(
          (a, b) =>
            (incidentByCamera.get(a.CameraID)?.distanceM ?? Infinity) -
            (incidentByCamera.get(b.CameraID)?.distanceM ?? Infinity),
        );
    } else if (effectiveFilter === "all") {
      // Surface incident-paired cameras first when browsing all.
      list = [...cameras].sort((a, b) => {
        const aMatch = incidentByCamera.get(a.CameraID);
        const bMatch = incidentByCamera.get(b.CameraID);
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        if (aMatch && bMatch) return aMatch.distanceM - bMatch.distanceM;
        return a.location.localeCompare(b.location, "en-SG");
      });
    } else {
      list = cameras.filter(
        (camera) => cameraGroup(camera.CameraID) === effectiveFilter,
      );
    }

    if (selectedCamera) {
      const rest = list.filter(
        (camera) => camera.CameraID !== selectedCamera.CameraID,
      );
      return [selectedCamera, ...rest];
    }
    return list;
  }, [cameras, effectiveFilter, incidentByCamera, selectedCamera]);

  const displayCameras = showAll
    ? filteredCameras
    : filteredCameras.slice(0, INITIAL_CAMERA_LIMIT);
  const showChips = groupCounts.length > 1 || incidentCount > 0;
  const expandedIncident = expanded
    ? incidentByCamera.get(expanded.CameraID)
    : undefined;

  return (
    <>
      <TerminalPanel
        feedStatus={feedStatus}
        title="ROAD CAMERAS"
        contentClassName="min-h-40 sm:min-h-52"
      >
        <div className="space-y-2">
          {showChips ? (
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Filter road cameras"
            >
              <button
                type="button"
                aria-pressed={effectiveFilter === "all"}
                onClick={() => {
                  setFilter("all");
                  setShowAll(false);
                }}
                className={`${CHIP_CLASS} ${
                  effectiveFilter === "all"
                    ? "border-ink bg-ink text-paper"
                    : "border-line text-muted hover:border-line-strong hover:text-ink"
                }`}
              >
                All <span className="opacity-70">{cameras.length}</span>
              </button>

              {incidentCount > 0 ? (
                <button
                  type="button"
                  aria-pressed={effectiveFilter === "incidents"}
                  onClick={() => {
                    setFilter(
                      effectiveFilter === "incidents" ? "all" : "incidents",
                    );
                    setShowAll(false);
                  }}
                  className={`${CHIP_CLASS} ${
                    effectiveFilter === "incidents"
                      ? "border-danger bg-danger text-paper"
                      : "border-danger/50 bg-danger/8 text-danger hover:border-danger"
                  }`}
                >
                  Near incidents <span>{incidentCount}</span>
                </button>
              ) : null}

              {groupCounts.map(({ group, count }) => {
                const active = effectiveFilter === group;
                return (
                  <button
                    key={group}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setFilter(active ? "all" : group);
                      setShowAll(false);
                    }}
                    className={`${CHIP_CLASS} ${
                      active
                        ? "border-ink bg-ink text-paper"
                        : "border-line text-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    {CAMERA_GROUP_LABEL[group]}{" "}
                    <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {displayCameras.length === 0 ? (
            <div className="text-[11px] text-muted">
              No traffic camera images are currently available.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {displayCameras.map((camera) => {
                const match = incidentByCamera.get(camera.CameraID);
                const isSelected = selectedCamera?.CameraID === camera.CameraID;
                return (
                  <button
                    key={camera.CameraID}
                    type="button"
                    className={`interactive-row overflow-hidden text-left ${
                      isSelected ? "border-info/70" : ""
                    }`}
                    onClick={() => setExpanded(camera)}
                    aria-label={`View camera ${camera.location}`}
                  >
                    <div className="relative">
                      <Image
                        src={camera.ImageLink}
                        alt={camera.location}
                        width={640}
                        height={360}
                        className="h-16 w-full object-cover sm:h-20"
                        loading="lazy"
                        unoptimized
                      />
                      {match ? (
                        <span
                          title={match.incident.message}
                          className="absolute right-1 top-1 border border-danger/60 bg-overlay px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-danger"
                        >
                          {match.incident.type} ·{" "}
                          {formatCameraDistance(match.distanceM)}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="truncate border-t border-line px-2 py-1.5 text-[10px] text-ink"
                      title={`${camera.location} (#${camera.CameraID})`}
                    >
                      {camera.location}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {filteredCameras.length > INITIAL_CAMERA_LIMIT ? (
            <button
              type="button"
              onClick={() => setShowAll((prev) => !prev)}
              className="action-button w-full"
            >
              {showAll
                ? "Show fewer"
                : `Show all ${filteredCameras.length} cameras`}
            </button>
          ) : null}
        </div>
      </TerminalPanel>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-overlay p-3 sm:p-4"
          onClick={() => closeModal()}
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={expanded.location}
            className="w-full max-w-4xl border border-line-strong bg-surface-raised p-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={expanded.ImageLink}
              alt={expanded.location}
              width={1280}
              height={720}
              className="max-h-[75vh] h-auto w-full object-contain"
              unoptimized
            />
            {expandedIncident ? (
              <div className="mt-2 border border-danger/50 bg-danger/8 px-2.5 py-1.5 font-mono text-[11px] text-danger">
                <span className="uppercase tracking-[0.08em]">
                  {expandedIncident.incident.type} ·{" "}
                  {formatCameraDistance(expandedIncident.distanceM)} away:
                </span>{" "}
                <span className="text-ink">
                  {expandedIncident.incident.message}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between p-2">
              <div className="min-w-0">
                <a
                  href={
                    googleMapsUrl({
                      lat: expanded.Latitude,
                      lng: expanded.Longitude,
                    }) ?? undefined
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${expanded.location} camera location in Google Maps`}
                  title={`Open ${expanded.location} camera location in Google Maps`}
                  className="block truncate text-sm text-info underline decoration-info/40 underline-offset-2 hover:decoration-info"
                >
                  {expanded.location}
                  <span aria-hidden="true" className="ml-1 text-[10px]">
                    ↗
                  </span>
                </a>
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                  {CAMERA_GROUP_LABEL[cameraGroup(expanded.CameraID)]} · ID{" "}
                  {expanded.CameraID}
                </div>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="action-button ml-3"
                onClick={() => closeModal()}
              >
                Close [Esc]
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
