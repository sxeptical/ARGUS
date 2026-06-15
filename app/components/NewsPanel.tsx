import TerminalPanel from "@/app/components/TerminalPanel";
import type { NewsItem } from "@/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-SG", {
    timeZone: "Asia/Singapore",
  });
}

type NewsPanelProps = {
  news: NewsItem[];
};

export default function NewsPanel({ news }: NewsPanelProps) {
  return (
    <TerminalPanel title="NEWS" contentClassName="min-h-36 sm:min-h-44">
      <div className="space-y-2">
        {news.length === 0 ? (
          <div className="terminal-dim text-[11px]">
            No news signals are currently available.
          </div>
        ) : null}

        {news.map((item) => {
          const content = (
            <>
              <div className="line-clamp-2 font-medium">{item.title}</div>
              <div className="mt-1 flex items-center justify-between text-[11px] terminal-dim">
                <span>{item.source}</span>
                <span suppressHydrationWarning>
                  {formatTime(item.publishedAt)}
                </span>
              </div>
            </>
          );

          if (item.url === "#") {
            return (
              <div
                key={`${item.url}-${item.publishedAt}`}
                className="block rounded border border-terminal-border/40 bg-white/2 p-2"
              >
                {content}
              </div>
            );
          }

          return (
            <a
              key={`${item.url}-${item.publishedAt}`}
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="block rounded border border-terminal-border/40 bg-white/2 p-2 transition hover:border-terminal-cyan/70 hover:bg-terminal-cyan/10"
            >
              {content}
            </a>
          );
        })}
      </div>
    </TerminalPanel>
  );
}
