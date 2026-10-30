"use client";

import Image from "next/image";
import { useState } from "react";
import type { PlacePhoto } from "@/types";

/**
 * Photo viewer for the Target Focus panel: one large photo, thumbnails to
 * switch, and the credit the active photo's licence requires (with a link to
 * its Commons page). Parents key it by place so it resets per selection.
 */
export function PlacePhotoGallery({ name, photos }: { name: string; photos: ReadonlyArray<PlacePhoto> }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const usable = photos.filter((photo) => !failed.has(photo.thumb));
  if (usable.length === 0) return null;

  const active = usable[Math.min(activeIndex, usable.length - 1)];
  const markFailed = (thumb: string) => setFailed((previous) => new Set(previous).add(thumb));

  return (
    <figure className="space-y-1.5">
      <div className="overflow-hidden border border-line bg-surface-raised">
        <Image
          key={active.thumb}
          src={active.thumb}
          alt={`${name}, photo ${usable.indexOf(active) + 1} of ${usable.length}`}
          width={480}
          height={320}
          className="h-40 w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => markFailed(active.thumb)}
          unoptimized
        />
      </div>
      {usable.length > 1 ? (
        <div className="grid grid-cols-3 gap-1.5">
          {usable.map((photo, index) => (
            <button
              key={photo.thumb}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show photo ${index + 1} of ${usable.length}`}
              aria-pressed={photo === active}
              className={`overflow-hidden border transition-colors duration-150 ${
                photo === active ? "border-ink" : "border-line opacity-70 hover:border-line-strong hover:opacity-100"
              }`}
            >
              <Image
                src={photo.thumb}
                alt=""
                width={160}
                height={107}
                className="h-12 w-full object-cover"
                referrerPolicy="no-referrer"
                loading="lazy"
                onError={() => markFailed(photo.thumb)}
                unoptimized
              />
            </button>
          ))}
        </div>
      ) : null}
      <figcaption className="text-[10px] leading-snug text-muted">
        {active.source === "nea" ? (
          "Photo: NEA (National Environment Agency)"
        ) : (
          <>
            Photo: {active.author}
            {active.license ? ` · ${active.license}` : ""} ·{" "}
            {active.page ? (
              <a href={active.page} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
                Wikimedia Commons
              </a>
            ) : (
              "Wikimedia Commons"
            )}
          </>
        )}
      </figcaption>
    </figure>
  );
}
