import type { SourceStatus } from "@/app/hooks/use-dashboard-sources";
import { useId } from "react";
import { usePersistentState } from "@/app/hooks/use-persistent-state";
import {
  parseStoredBoolean,
  prefKey,
} from "@/lib/ui-preferences";

type TerminalPanelProps = {
  title: string;
  children: React.ReactNode;
  feedStatus?: SourceStatus;
  className?: string;
  contentClassName?: string;
  defaultExpanded?: boolean;
};

export default function TerminalPanel({
  title,
  children,
  feedStatus,
  className,
  contentClassName,
  defaultExpanded = true,
}: TerminalPanelProps) {
  const [expanded, setExpanded] = usePersistentState(
    prefKey("panel-expanded", title),
    defaultExpanded,
    parseStoredBoolean,
  );
  const contentId = useId();

  return (
    <section className={`terminal-panel flex flex-col ${className ?? ""}`}>
      <button
        type="button"
        className="terminal-header w-full cursor-pointer justify-between"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-controls={contentId}
      >
        <span>{title}</span>
        <span
          aria-hidden="true"
          className="grid h-5 w-5 place-items-center text-base font-normal leading-none text-muted"
        >
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded ? (
        <div
          id={contentId}
          className={`terminal-content min-h-0 flex-1 overflow-auto ${contentClassName ?? ""}`}
        >
          {feedStatus && feedStatus !== "ok" && (
            <p role="status" className="text-[11px] text-muted">
              {feedStatus === "loading" ? "Loading feed…" :
                feedStatus === "stale" ? "Refresh failed. Showing the last available data." :
                "Feed unavailable. Retrying on refresh."}
            </p>
          )}
          {feedStatus !== "loading" && feedStatus !== "error" && children}
        </div>
      ) : null}
    </section>
  );
}
