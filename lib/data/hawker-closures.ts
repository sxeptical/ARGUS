import hawkerClosuresData from "@/public/hawker-closures.json";
import type { HawkerClosure } from "@/types";

const CLOSURE_KINDS: ReadonlySet<string> = new Set(["cleaning", "other-works"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isClosure = (value: unknown): value is HawkerClosure => {
  const closure = value as Partial<HawkerClosure> | null;
  return (
    typeof closure?.kind === "string" &&
    CLOSURE_KINDS.has(closure.kind) &&
    typeof closure.start === "string" &&
    ISO_DATE_RE.test(closure.start) &&
    typeof closure.end === "string" &&
    ISO_DATE_RE.test(closure.end) &&
    closure.end >= closure.start &&
    (closure.remarks === null || typeof closure.remarks === "string")
  );
};

/** public/hawker-closures.json maps hawker-centre id → its closure periods. */
export function validateHawkerClosuresBundle(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (periods) => Array.isArray(periods) && periods.every(isClosure),
  );
}

// Built by scripts/fetch-hawker-closures.mjs; see that script for the join
// and licence (NEA via data.gov.sg, Singapore Open Data Licence).
if (!validateHawkerClosuresBundle(hawkerClosuresData))
  throw new Error("Invalid hawker closures bundle");
const HAWKER_CLOSURES = new Map<string, HawkerClosure[]>(
  Object.entries(hawkerClosuresData as Record<string, HawkerClosure[]>),
);
export { HAWKER_CLOSURES };
