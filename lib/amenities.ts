/**
 * Popup copy for the static mall and hawker centre
 * layers. Pure so the map and tests share one definition.
 */
import type { PopupLine } from "@/lib/mobility";
import type { HawkerCentre, HawkerClosure, Mall, PlacePhoto } from "@/types";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

const DAY_NAMES: Record<string, string> = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun" };

/**
 * Turn the common OpenStreetMap `opening_hours` shapes into plain English
 * ("Mo-Su,PH 10:00-22:00" → "Daily 10:00–22:00"). Returns null for "off".
 */
export const formatOpeningHours = (raw: string): string | null => {
  const value = raw.trim().replace(/\s*,\s*PH\b/g, "").replace(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g, "$1–$2");
  if (value === "off") return null;
  if (value === "24/7" || /^Mo-Su 00:00–24:00$/.test(value)) return "Open 24 hours";
  if (/^\d{2}:\d{2}–\d{2}:\d{2}$/.test(value)) return `Daily ${value}`;
  return value
    .replace(/^Mo-Su\b/, "Daily")
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, (day) => DAY_NAMES[day])
    .replace(/;\s*/g, ", ");
};

/**
 * Today's calendar date in Singapore (YYYY-MM-DD), so closure boundaries
 * line up with NEA's local dates regardless of the viewer's timezone.
 */
export const singaporeToday = (now = new Date()): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Dec", "12–15 Dec", or "28 Dec 2025–2 Jan 2026" for ISO date ranges. */
export const formatClosureRange = (start: string, end: string): string => {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (start === end) return `${sd} ${MONTHS[sm - 1]}`;
  if (sy === ey && sm === em) return `${sd}–${ed} ${MONTHS[sm - 1]}`;
  if (sy === ey) return `${sd} ${MONTHS[sm - 1]}–${ed} ${MONTHS[em - 1]}`;
  return `${sd} ${MONTHS[sm - 1]} ${sy}–${ed} ${MONTHS[em - 1]} ${ey}`;
};

export type HawkerClosureStatus = {
  /** True when a closure covers today; false when it is the next upcoming. */
  current: boolean;
  text: string;
};

/**
 * The closure worth showing for a hawker centre: the one covering today
 * (earliest-ending, so "closed now until" is the soonest reopening), else
 * the next upcoming period. Computed at render time from the stored ISO
 * periods; past periods and centres with no closure row yield null.
 */
export const describeHawkerClosure = (
  closures: ReadonlyArray<HawkerClosure>,
  todayIso: string = singaporeToday(),
): HawkerClosureStatus | null => {
  const valid = closures.filter((closure) => closure.end >= closure.start);
  const current = valid
    .filter((closure) => closure.start <= todayIso && todayIso <= closure.end)
    .sort((a, b) => a.end.localeCompare(b.end))[0];
  const next = current
    ? undefined
    : valid
      .filter((closure) => closure.start > todayIso)
      .sort((a, b) => a.start.localeCompare(b.start))[0];
  const closure = current ?? next;
  if (!closure) return null;
  const kind = closure.kind === "cleaning" ? "cleaning" : "other works";
  const remarks = closure.remarks ? ` — ${closure.remarks}` : "";
  return {
    current: Boolean(current),
    text: current
      ? `Closed now for ${kind} until ${formatClosureRange(closure.end, closure.end)}${remarks}`
      : `Closed for ${kind} ${formatClosureRange(closure.start, closure.end)}${remarks}`,
  };
};

export const describeHawkerCentre = (
  hawker: HawkerCentre,
  todayIso: string = singaporeToday(),
): PopupLine[] => {
  const closure = describeHawkerClosure(hawker.closures, todayIso);
  return [
  { text: hawker.name, kind: "name" },
  hawker.status === "open"
    ? { text: "In operation", kind: "status", tone: "success" as const }
    : {
        text: hawker.expectedYear ? `Under construction · expected ${hawker.expectedYear}` : "Under construction",
        kind: "status" as const,
        tone: "muted" as const,
      },
  ...(closure ? [{ text: closure.text, kind: (closure.current ? "status" : "detail") as "status" | "detail", tone: (closure.current ? "warning" : "muted") as "warning" | "muted" }] : []),
  ...(hawker.stalls === null ? [] : [{ text: plural(hawker.stalls, "cooked food stall", "cooked food stalls"), kind: "count" as const }]),
  ...(hawker.address ? [{ text: hawker.address, kind: "detail" as const }] : []),
  ...creditLine(hawker.photos),
  { text: "Source: NEA via data.gov.sg", kind: "hint" },
  ];
};

/**
 * "Photos: A, B (CC BY-SA 4.0); C (CC BY 2.5) · Wikimedia Commons", or
 * "Photo: NEA" for NEA's own hawker centre photo.
 */
export const photoCredit = (photos: ReadonlyArray<PlacePhoto>): string | null => {
  const commons = photos.filter((photo) => photo.source === "commons");
  if (!commons.length) return photos.some((photo) => photo.source === "nea") ? "Photo: NEA" : null;
  const authorsByLicense = new Map<string, Set<string>>();
  for (const photo of commons) {
    const license = photo.license ?? "unknown licence";
    authorsByLicense.set(license, (authorsByLicense.get(license) ?? new Set()).add(photo.author));
  }
  const groups = [...authorsByLicense].map(([license, authors]) => `${[...authors].join(", ")} (${license})`);
  return `${commons.length === 1 ? "Photo" : "Photos"}: ${groups.join("; ")} · Wikimedia Commons`;
};

const creditLine = (photos: ReadonlyArray<PlacePhoto>): PopupLine[] => {
  const credit = photoCredit(photos);
  return credit ? [{ text: credit, kind: "hint" }] : [];
};

export const describeMall = (mall: Mall): PopupLine[] => {
  const hours = mall.openingHours ? formatOpeningHours(mall.openingHours) : null;
  return [
    { text: mall.name, kind: "name" },
    ...(mall.stores === null
      ? []
      : [{
          text: mall.fnb === null ? plural(mall.stores, "shop", "shops") : `${plural(mall.stores, "shop", "shops")} · ${mall.fnb} food & drink`,
          kind: "count" as const,
        }]),
    ...(mall.nearestMrt ? [{ text: `Nearest MRT: ${mall.nearestMrt}`, kind: "detail" as const }] : []),
    ...(hours ? [{ text: hours, kind: "detail" as const }] : []),
    ...(mall.address ? [{ text: mall.address, kind: "detail" as const }] : []),
    ...creditLine(mall.photos),
    {
      text: mall.stores === null ? "Location: © OpenStreetMap contributors" : "Shops: curioputterings/singapore-mall-data · Location: © OpenStreetMap",
      kind: "hint",
    },
  ];
};
