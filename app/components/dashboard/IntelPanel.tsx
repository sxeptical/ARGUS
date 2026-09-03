import type { ReactNode } from "react";

export function IntelPanel({
  title,
  badge,
  children,
}: {
  title: string;
  badge: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-line bg-surface p-2">
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-line px-1 pb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
          {title}
        </h2>
        <span className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
          {badge}
        </span>
      </div>
      {children}
    </section>
  );
}

export function SignalBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="border-b border-line px-1 py-2 last:border-b-0">
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[10px] text-muted">
        <span>{label}</span>
        <span className="font-mono text-ink">{value}%</span>
      </div>
      <div
        className="h-1 w-full overflow-hidden bg-line"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
      >
        <div className={`h-full ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-1 py-2 last:border-b-0">
      <span className="data-label">{label}</span>
      <span className="font-mono text-xs text-ink">{value}</span>
    </div>
  );
}

export function LegendDot({ tone, label }: { tone: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${tone}`} />
      <span>{label}</span>
    </span>
  );
}
