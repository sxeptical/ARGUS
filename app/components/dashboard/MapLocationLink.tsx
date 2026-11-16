import { googleMapsUrl } from "@/lib/maps-links";

/**
 * Focus-dialog row whose value links out in a new tab, styled like the
 * KeyValue rows around it (label left, value right, ↗ marks it external).
 */
export function ExternalLinkRow({
  label,
  href,
  text,
  title,
}: {
  label: string;
  href: string;
  text: string;
  /** Tooltip and accessible name, when the text alone is ambiguous. */
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line px-1 py-2 last:border-b-0">
      <span className="data-label shrink-0">{label}</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={title}
        title={title}
        className="group inline-flex min-w-0 items-center justify-end gap-1 text-right font-mono text-xs text-info underline decoration-info/40 underline-offset-2 hover:decoration-info"
      >
        <span className="break-all">{text}</span>
        <span aria-hidden="true" className="shrink-0 text-[10px] leading-none">
          ↗
        </span>
      </a>
    </div>
  );
}

/** "https://www.sp.edu.sg/" → "sp.edu.sg"; keeps any path. */
export const displayUrl = (href: string) =>
  href.replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");

/**
 * Focus-dialog location row whose text links out to Google Maps in a new tab.
 * With no street address the row becomes "Location · Open in Google Maps" and
 * the link drops a pin at the marker's coordinates.
 */
export function MapLocationLink({
  name,
  address,
  lat,
  lng,
  label = "Address",
}: {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  /** Row label when an address is shown; defaults to "Address". */
  label?: string;
}) {
  const href = googleMapsUrl({ name, address, lat, lng });
  const text = address?.trim();
  if (!href) return null;

  return (
    <ExternalLinkRow
      label={text ? label : "Location"}
      href={href}
      text={text || "Open in Google Maps"}
      title={`Open ${name} in Google Maps`}
    />
  );
}
