import TerminalPanel from "@/app/components/TerminalPanel";
import type { NewsItem } from "@/types";

type NewsPanelProps = {
  news: NewsItem[];
};

export default function NewsPanel({ news }: NewsPanelProps) {
  return (
    <TerminalPanel title="NEWS" className="min-h-44">
      <div className="space-y-2">
        {news.map((item) => (
          <a
            key={`${item.url}-${item.publishedAt}`}
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="block rounded border border-terminal-border/40 bg-white/2 p-2 transition hover:border-terminal-cyan/70 hover:bg-terminal-cyan/10"
          >
            <div className="line-clamp-2 font-medium">{item.title}</div>
            <div className="mt-1 flex items-center justify-between text-[11px] terminal-dim">
              <span>{item.source}</span>
              <span>{new Date(item.publishedAt).toLocaleTimeString()}</span>
            </div>
          </a>
        ))}
      </div>
    </TerminalPanel>
  );
}
