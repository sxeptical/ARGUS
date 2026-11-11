"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useFocusTrap } from "@/app/hooks/use-focus-trap";
import { KeyValue } from "@/app/components/dashboard/IntelPanel";
import { MapLocationLink } from "@/app/components/dashboard/MapLocationLink";
import { hasStoreDirectory, MallStoreDirectory } from "@/app/components/dashboard/MallDirectory";
import { PlacePhotoGallery } from "@/app/components/dashboard/PlacePhotoGallery";
import { describeHawkerClosure, formatOpeningHours } from "@/lib/amenities";
import type { SelectedAmenity } from "@/lib/amenity-layers";
import { GYM_CATEGORY_LABEL, GYM_SOURCE_HINT } from "@/lib/gyms";
import { COMMUNITY_CLUB_KIND_LABEL, COMMUNITY_CLUB_SOURCE_HINT } from "@/lib/community-clubs";
import { PHARMACY_SOURCE_HINT } from "@/lib/pharmacies";
import { HOTEL_SOURCE_HINT } from "@/lib/hotels";
import { HERITAGE_KIND_LABEL, HERITAGE_SOURCE_HINT } from "@/lib/heritage";
import { HEALTHCARE_KIND_LABEL, HEALTHCARE_SOURCE_HINT } from "@/lib/healthcare";
import { LIBRARY_SOURCE_HINT } from "@/lib/libraries";
import { SUPERMARKET_SOURCE_HINT } from "@/lib/supermarkets";
import { SCHOOL_LEVEL_LABEL, SCHOOL_SOURCE_HINT } from "@/lib/schools";
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

  return amenity ? <AmenityFocus amenity={amenity} onClose={onClose} /> : null;
}

type AmenityDetails = {
  /** Dialog header, e.g. "Hawker Centre". */
  kind: string;
  /** Facts shown above the address row. */
  rows?: ReactNode;
  website?: { href: string; label?: string; text?: string };
  /** Data source credit shown under the details. */
  source?: string;
};

const hours = (raw: string | null) =>
  raw ? <KeyValue label="Hours" value={formatOpeningHours(raw) ?? raw} /> : null;

/** What is specific to each amenity; AmenityFocus lays every one out the same way. */
function amenityDetails(amenity: SelectedAmenity): AmenityDetails {
  switch (amenity.type) {
    case "mall": {
      const mall = amenity.place;
      return {
        kind: "Shopping Mall",
        rows: (
          <>
            {mall.stores !== null ? <KeyValue label="Shops" value={mall.stores.toLocaleString("en-SG")} /> : null}
            {mall.fnb !== null ? <KeyValue label="Food & Drink" value={mall.fnb.toLocaleString("en-SG")} /> : null}
            {mall.nearestMrt ? <KeyValue label="Nearest MRT" value={mall.nearestMrt} /> : null}
            {hours(mall.openingHours)}
          </>
        ),
      };
    }
    case "hawker": {
      const hawker = amenity.place;
      const closure = describeHawkerClosure(hawker.closures);
      return {
        kind: "Hawker Centre",
        rows: (
          <>
            <KeyValue
              label="Status"
              value={hawker.status === "planned" ? (hawker.expectedYear ? `Under construction · expected ${hawker.expectedYear}` : "Under construction") : "In operation"}
            />
            {closure ? <KeyValue label="Closure" value={closure.text} /> : null}
            {hawker.stalls !== null ? <KeyValue label="Stalls" value={`${hawker.stalls.toLocaleString("en-SG")} cooked food`} /> : null}
          </>
        ),
      };
    }
    case "gym": {
      const gym = amenity.place;
      return {
        kind: "Gym",
        rows: (
          <>
            <KeyValue label="Type" value={GYM_CATEGORY_LABEL[gym.category]} />
            {gym.brand !== "Independent" ? <KeyValue label="Brand" value={gym.brand} /> : null}
            {hours(gym.openingHours)}
          </>
        ),
        website: gym.website ? { href: gym.website } : undefined,
        source: GYM_SOURCE_HINT[gym.source],
      };
    }
    case "community-club": {
      const kind = COMMUNITY_CLUB_KIND_LABEL[amenity.place.kind];
      return { kind, rows: <KeyValue label="Type" value={kind} />, source: COMMUNITY_CLUB_SOURCE_HINT };
    }
    case "pharmacy":
      return { kind: "Pharmacy", source: PHARMACY_SOURCE_HINT };
    case "hotel": {
      const { rooms } = amenity.place;
      return {
        kind: "Hotel",
        rows: rooms !== null ? <KeyValue label="Licensed rooms" value={rooms.toLocaleString("en-SG")} /> : null,
        source: HOTEL_SOURCE_HINT,
      };
    }
    case "heritage": {
      const site = amenity.place;
      return {
        kind: HERITAGE_KIND_LABEL[site.kind],
        rows: site.description ? <KeyValue label="About" value={site.description} /> : null,
        website: site.website
          ? site.source === "nhb"
            ? { href: site.website, label: "Roots.sg", text: "More on Roots.sg" }
            : { href: site.website }
          : undefined,
        source: HERITAGE_SOURCE_HINT[site.source],
      };
    }
    case "healthcare": {
      const site = amenity.place;
      return {
        kind: HEALTHCARE_KIND_LABEL[site.kind],
        rows: (
          <>
            {site.programmes.length ? <KeyValue label="Schemes" value={site.programmes.join(" · ")} /> : null}
            {site.phone ? <KeyValue label="Telephone" value={site.phone} /> : null}
          </>
        ),
        source: HEALTHCARE_SOURCE_HINT[site.source],
      };
    }
    case "library": {
      const library = amenity.place;
      return {
        kind: "Public Library",
        rows: library.branch ? <KeyValue label="Branch" value={library.branch} /> : null,
        source: LIBRARY_SOURCE_HINT[library.source],
      };
    }
    case "supermarket": {
      const market = amenity.place;
      return {
        kind: "Supermarket",
        rows: (
          <>
            {market.brand !== "Other" ? <KeyValue label="Brand" value={market.brand} /> : null}
            {hours(market.openingHours)}
          </>
        ),
        website: market.website ? { href: market.website } : undefined,
        source: SUPERMARKET_SOURCE_HINT,
      };
    }
    case "school": {
      const school = amenity.place;
      return {
        kind: `${SCHOOL_LEVEL_LABEL[school.level]} School`,
        rows: (
          <>
            {school.phone ? <KeyValue label="Telephone" value={school.phone} /> : null}
            {school.mrt ? <KeyValue label="MRT" value={school.mrt} /> : null}
            {school.bus ? <KeyValue label="Bus" value={school.bus} /> : null}
          </>
        ),
        website: school.website ? { href: school.website } : undefined,
        source: SCHOOL_SOURCE_HINT,
      };
    }
  }
}

/**
 * Every amenity reads the same way: photos, its facts, the address (linked
 * to Google Maps), its website, then the data source. Malls with a store
 * directory put that beside the details in a wide two-column layout.
 */
function AmenityFocus({ amenity, onClose }: { amenity: SelectedAmenity; onClose: () => void }) {
  const { place } = amenity;
  const { kind, rows, website, source } = amenityDetails(amenity);
  const withDirectory = amenity.type === "mall" && hasStoreDirectory(place.id);
  const details = (
    <div className="space-y-2 p-4 text-xs">
      {"photos" in place ? <PlacePhotoGallery key={place.id} name={place.name} photos={place.photos} /> : null}
      <div>
        {rows}
        <MapLocationLink name={place.name} address={place.address} lat={place.lat} lng={place.lng} />
        {website ? (
          <div className="flex gap-2 py-1">
            <span className="data-label w-20 shrink-0">{website.label ?? "Website"}</span>
            <a
              href={website.href}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 break-all text-info underline decoration-info/40 hover:decoration-info"
            >
              {website.text ?? website.href}
            </a>
          </div>
        ) : null}
      </div>
      {source ? <p className="text-[11px] leading-relaxed text-muted">{source}</p> : null}
    </div>
  );
  return (
    <FocusShell kind={kind} title={place.name} wide={withDirectory} onClose={onClose}>
      {withDirectory ? (
        <div className="md:grid md:h-full md:min-h-0 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="border-b border-line md:min-h-0 md:overflow-y-auto md:border-b-0 md:border-r">{details}</div>
          <MallStoreDirectory key={place.id} mallId={place.id} mallName={place.name} />
        </div>
      ) : (
        details
      )}
    </FocusShell>
  );
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

  // Focuses the panel on open, traps Tab inside it and restores the trigger on close.
  useFocusTrap(panelRef, true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Claim Escape so other document listeners (e.g. radius picking) back off.
      event.preventDefault();
      onCloseRef.current();
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
