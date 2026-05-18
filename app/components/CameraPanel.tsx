"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import TerminalPanel from "@/app/components/TerminalPanel";
import type { TrafficCamera } from "@/types";

type CameraPanelProps = {
  cameras: TrafficCamera[];
  selectedCamera: TrafficCamera | null;
};

export default function CameraPanel({ cameras, selectedCamera }: CameraPanelProps) {
  const [expanded, setExpanded] = useState<TrafficCamera | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const closeModal = useCallback(() => {
    setExpanded(null);
    previousFocusRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    },
    [closeModal],
  );

  useEffect(() => {
    if (!expanded) return;

    previousFocusRef.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [expanded, handleKeyDown]);

  const displayCameras = useMemo(() => {
    if (selectedCamera) {
      const rest = cameras.filter((camera) => camera.CameraID !== selectedCamera.CameraID).slice(0, 5);
      return [selectedCamera, ...rest];
    }

    return cameras.slice(0, 6);
  }, [cameras, selectedCamera]);

  return (
    <>
      <TerminalPanel title="ROAD CAMERAS" contentClassName="min-h-52">
        <div className="grid grid-cols-2 gap-2">
          {displayCameras.map((camera) => (
            <button
              key={camera.CameraID}
              type="button"
              className="overflow-hidden rounded border border-terminal-border/40 bg-black/30 text-left hover:border-terminal-cyan"
              onClick={() => setExpanded(camera)}
              aria-label={`View camera ${camera.location}`}
            >
              <Image
                src={camera.ImageLink}
                alt={camera.location}
                width={640}
                height={360}
                className="h-20 w-full object-cover"
                loading="lazy"
                unoptimized
              />
              <div className="truncate px-2 py-1 text-[11px] terminal-dim">{camera.location}</div>
            </button>
          ))}
        </div>
      </TerminalPanel>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => closeModal()}
          role="presentation"
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={expanded.location}
            className="max-w-4xl rounded border border-terminal-cyan/70 bg-terminal-panel p-2"
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
              <span className="terminal-cyan text-sm">{expanded.location}</span>
              <button
                ref={closeButtonRef}
                type="button"
                className="terminal-dim hover:terminal-text rounded px-2 py-1 text-xs"
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
