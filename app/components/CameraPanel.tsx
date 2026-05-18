"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import TerminalPanel from "@/app/components/TerminalPanel";
import type { TrafficCamera } from "@/types";

type CameraPanelProps = {
  cameras: TrafficCamera[];
  selectedCamera: TrafficCamera | null;
};

export default function CameraPanel({ cameras, selectedCamera }: CameraPanelProps) {
  const [expanded, setExpanded] = useState<TrafficCamera | null>(null);

  const displayCameras = useMemo(() => {
    if (selectedCamera) {
      const rest = cameras.filter((camera) => camera.CameraID !== selectedCamera.CameraID).slice(0, 5);
      return [selectedCamera, ...rest];
    }

    return cameras.slice(0, 6);
  }, [cameras, selectedCamera]);

  return (
    <>
      <TerminalPanel title="ROAD CAMERAS" className="min-h-52">
        <div className="grid grid-cols-2 gap-2">
          {displayCameras.map((camera) => (
            <button
              key={camera.CameraID}
              type="button"
              className="overflow-hidden rounded border border-terminal-border/40 bg-black/30 text-left hover:border-terminal-cyan"
              onClick={() => setExpanded(camera)}
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
          onClick={() => setExpanded(null)}
          role="presentation"
        >
          <div className="max-w-4xl rounded border border-terminal-cyan/70 bg-terminal-panel p-2">
            <Image
              src={expanded.ImageLink}
              alt={expanded.location}
              width={1280}
              height={720}
              className="max-h-[75vh] h-auto w-full object-contain"
              unoptimized
            />
            <div className="p-2 text-sm">
              <span className="terminal-cyan">{expanded.location}</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
