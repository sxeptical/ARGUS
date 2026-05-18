"use client";

import { useId, useState } from "react";

type TerminalPanelProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultExpanded?: boolean;
};

export default function TerminalPanel({
  title,
  children,
  className,
  defaultExpanded = true,
}: TerminalPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
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
        <span className="flex items-center gap-2">
          <span className="terminal-cyan">&gt;</span>
          {title}
        </span>
        <span className="terminal-dim text-[11px]">{expanded ? "[-]" : "[+]"}</span>
      </button>
      {expanded ? (
        <div id={contentId} className="terminal-content flex-1 overflow-auto">
          {children}
        </div>
      ) : null}
    </section>
  );
}
