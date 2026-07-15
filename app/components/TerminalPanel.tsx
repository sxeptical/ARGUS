import { useId, useState } from "react";

type TerminalPanelProps = {
  title: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  defaultExpanded?: boolean;
};

export default function TerminalPanel({
  title,
  children,
  className,
  contentClassName,
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
          className={`terminal-content flex-1 overflow-auto ${contentClassName ?? ""}`}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
