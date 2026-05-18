"use client";

import { useState } from "react";

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

  return (
    <section className={`terminal-panel flex flex-col ${className ?? ""}`}>
      <button
        type="button"
        className="terminal-header w-full cursor-pointer justify-between"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="flex items-center gap-2">
          <span className="terminal-cyan">&gt;</span>
          {title}
        </span>
        <span className="terminal-dim text-[11px]">{expanded ? "[-]" : "[+]"}</span>
      </button>
      {expanded ? <div className="terminal-content flex-1 overflow-auto">{children}</div> : null}
    </section>
  );
}
