"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { SelectedAmenity } from "@/app/hooks/use-dashboard-state";
import { KeyValue } from "@/app/components/dashboard/IntelPanel";
import { hasStoreDirectory, MallStoreDirectory } from "@/app/components/dashboard/MallDirectory";
import { PlacePhotoGallery } from "@/app/components/dashboard/PlacePhotoGallery";
import { formatOpeningHours } from "@/lib/amenities";
import { formatAltitudeFeet, formatSpeedKmh } from "@/lib/formatters";
import { photosForPark } from "@/lib/park-photos";
import { PARK_KIND_TITLE } from "@/lib/parks";
import type { FlightState, ParksGeoJson } from "@/types";

type ParkDetails = ParksGeoJson["features"][number]["properties"];

/**
 * Focus mode: whatever the map, search or flight list locked onto opens in a
 * centred dialog (same look as the map search). Esc, the close button or a
 * click outside clears the selection. Malls with a store directory get a
 * wide two-column layout: details beside the directory.
 */
export function FocusDialog({
  flight,
  park,
  amenity,
  onClose,
}: {
  flight: FlightState | null;
  park: ParkDetails | null;
  amenity: SelectedAmenity | null;
  onClose: () => void;
}) {
  if (flight) {
    return (
      <FocusShell kind="Flight" title={flight.callsign} subtitle={flight.originCountry} onClose={onClose}>
        <div className="space-y-1 p-4 text-xs">
          <KeyValue label="Direction" value={flight.direction.toUpperCase()} />
          <KeyValue label="Altitude" value={formatAltitudeFeet(flight.altitude)} />
          <KeyValue label="Speed" value={formatSpeedKmh(flight.velocity)} />
          <KeyValue label="Track" value={flight.track !== null ? `${Math.round(flight.track)}°` : "N/A"} />
        </div>
      </FocusShell>
    );
  }

  if (park) {
    return (
      <FocusShell kind={PARK_KIND_TITLE[park.kind]} title={park.name} onClose={onClose}>
        <div className="space-y-2 p-4 text-xs">
          {park.kind === "park" ? <PlacePhotoGallery key={park.name} name={park.name} photos={photosForPark(park.name)} /> : null}
          <div>
            {park.kind === "park" && park.areaHa ? <KeyValue label="Size" value={`${park.areaHa.toLocaleString("en-SG")} ha`} /> : null}
            {park.kind === "pcn" ? <KeyValue label="Use" value="Walking, running, cycling" /> : null}
            {park.kind === "trail" && park.park ? <KeyValue label="Park" value={park.park} /> : null}
            {park.kind === "trail" ? <KeyValue label="Access" value={park.cycle ? "Walking and cycling" : "Walking only"} /> : null}
            {park.kind === "trail" && park.type ? <KeyValue label="Type" value={park.type} /> : null}
          </div>
        </div>
      </FocusShell>
    );
  }

  if (amenity?.type === "hawker") {
    const { hawker } = amenity;
    return (
      <FocusShell kind="Hawker Centre" title={hawker.name} onClose={onClose}>
        <div className="space-y-2 p-4 text-xs">
          <PlacePhotoGallery key={hawker.id} name={hawker.name} photos={hawker.photos} />
          <div>
            <KeyValue
              label="Status"
              value={hawker.status === "planned" ? (hawker.expectedYear ? `Under construction · expected ${hawker.expectedYear}` : "Under construction") : "In operation"}
            />
            {hawker.stalls !== null ? <KeyValue label="Stalls" value={`${hawker.stalls.toLocaleString("en-SG")} cooked food`} /> : null}
            {hawker.address ? <KeyValue label="Address" value={hawker.address} /> : null}
          </div>
        </div>
      </FocusShell>
    );
  }

  if (amenity?.type === "mall") {
    const { mall } = amenity;
    const withDirectory = hasStoreDirectory(mall.id);
    const details = (
      <div className="space-y-2 p-4 text-xs">
        <PlacePhotoGallery key={mall.id} name={mall.name} photos={mall.photos} />
        <div>
          {mall.stores !== null ? <KeyValue label="Shops" value={mall.stores.toLocaleString("en-SG")} /> : null}
          {mall.fnb !== null ? <KeyValue label="Food & Drink" value={mall.fnb.toLocaleString("en-SG")} /> : null}
          {mall.nearestMrt ? <KeyValue label="Nearest MRT" value={mall.nearestMrt} /> : null}
          {mall.openingHours ? <KeyValue label="Hours" value={formatOpeningHours(mall.openingHours) ?? mall.openingHours} /> : null}
          {mall.address ? <KeyValue label="Address" value={mall.address} /> : null}
        </div>
      </div>
    );
    return (
      <FocusShell kind="Shopping Mall" title={mall.name} wide={withDirectory} onClose={onClose}>
        {withDirectory ? (
          <div className="md:grid md:h-full md:min-h-0 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <div className="border-b border-line md:min-h-0 md:overflow-y-auto md:border-b-0 md:border-r">{details}</div>
            <MallStoreDirectory key={mall.id} mallId={mall.id} mallName={mall.name} />
          </div>
        ) : (
          details
        )}
      </FocusShell>
    );
  }

  return null;
}

function FocusShell({
  kind,
  title,
  subtitle,
  wide = false,
  onClose,
  children,
}: {
  kind: string;
  title: string;
  subtitle?: string;
  wide?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The dashboard re-renders on every live poll; read the latest onClose
  // through a ref so focus and the Esc listener are set up once per open.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    panelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 p-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`flex max-h-[calc(100dvh-1.5rem)] w-full flex-col overflow-hidden rounded-xl border border-line-strong bg-surface shadow-2xl shadow-black/50 outline-none ${
          wide ? "max-w-4xl md:h-[min(85vh,44rem)]" : "max-w-md sm:max-h-[min(85vh,44rem)]"
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">Focus · {kind}</div>
            <h2 id="focus-dialog-title" className="truncate font-mono text-base font-medium text-ink">{title}</h2>
            {subtitle ? <div className="data-label">{subtitle}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-muted hover:border-line-strong hover:text-ink sm:px-2 sm:py-1"
            aria-label={`Close ${title}`}
          >
            <span className="sm:hidden">Close</span>
            <span className="hidden sm:inline">Esc</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto md:overflow-hidden">
          {/* Narrow layouts scroll here; the wide mall layout scrolls per column. */}
          <div className={wide ? "md:h-full" : "md:h-full md:overflow-y-auto"}>{children}</div>
        </div>
      </div>
    </div>
  );
}
