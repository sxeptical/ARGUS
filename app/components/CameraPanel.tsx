import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import TerminalPanel from "@/app/components/TerminalPanel";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";
import { googleMapsUrl } from "@/lib/maps-links";
import type { TrafficCamera } from "@/types";

type CameraPanelProps = {
  cameras: TrafficCamera[];
  selectedCamera: TrafficCamera | null;
};

export default function CameraPanel({
  cameras,
  selectedCamera,
}: CameraPanelProps) {
  const [expanded, setExpanded] = useState<TrafficCamera | null>(null);
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

  const displayCameras = useMemo(() => {
    if (selectedCamera) {
      const rest = cameras
        .filter((camera) => camera.CameraID !== selectedCamera.CameraID)
        .slice(0, 5);
      return [selectedCamera, ...rest];
    }

    return cameras.slice(0, 6);
  }, [cameras, selectedCamera]);

  return (
    <>
      <TerminalPanel
        title="ROAD CAMERAS"
        contentClassName="min-h-40 sm:min-h-52"
      >
        {displayCameras.length === 0 ? (
          <div className="text-[11px] text-muted">
            No traffic camera images are currently available.
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          {displayCameras.map((camera) => (
            <button
              key={camera.CameraID}
              type="button"
              className="interactive-row overflow-hidden text-left"
              onClick={() => setExpanded(camera)}
              aria-label={`View camera ${camera.location}`}
            >
              <Image
                src={camera.ImageLink}
                alt={camera.location}
                width={640}
                height={360}
                className="h-16 w-full object-cover sm:h-20"
                loading="lazy"
                unoptimized
              />
              <div className="truncate border-t border-line px-2 py-1.5 text-[10px] text-muted">
                {camera.location}
              </div>
            </button>
          ))}
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
            <div className="flex items-center justify-between p-2">
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
                className="truncate text-sm text-info underline decoration-info/40 underline-offset-2 hover:decoration-info"
              >
                {expanded.location}
                <span aria-hidden="true" className="ml-1 text-[10px]">
                  ↗
                </span>
              </a>
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
