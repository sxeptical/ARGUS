"use client";

import { useDeferredValue, useMemo, useState } from "react";
import useSWRImmutable from "swr/immutable";
import { LayerFilterInput } from "@/app/components/dashboard/LayerControls";
import { MALL_STORE_INDEX, mallStoresUrl } from "@/lib/data/mall-stores";
import { countCategories, filterStores, groupStoresByLevel, isMallStoreList } from "@/lib/mall-stores";
import type { MallStore } from "@/types";

const DATA_SOURCE_URL = "https://github.com/curioputterings/singapore-mall-data";

const fetchStoreList = async (url: string): Promise<MallStore[]> => {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data: unknown = await response.json();
  if (!isMallStoreList(data)) throw new Error("Invalid store list");
  return data;
};

export const hasStoreDirectory = (mallId: string) => mallStoresUrl(mallId) !== null;

/**
 * A mall's shops for the focus dialog (fetched when it opens), filterable by
 * name/unit, category and halal, grouped by floor. From `md` (768px) up it fills its
 * column and scrolls the list itself; below that it flows with the dialog,
 * keeping the filters pinned. Key it by mall so filters reset per mall.
 */
export function MallStoreDirectory({ mallId, mallName }: { mallId: string; mallName: string }) {
  const { data: stores, error, isLoading, mutate } = useSWRImmutable<MallStore[], Error>(mallStoresUrl(mallId), fetchStoreList);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [halalOnly, setHalalOnly] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const categories = useMemo(() => countCategories(stores ?? []), [stores]);
  const hasHalal = useMemo(() => stores?.some((store) => store.halal) ?? false, [stores]);
  const groups = useMemo(
    () => groupStoresByLevel(filterStores(stores ?? [], { query: deferredQuery, category, halalOnly })),
    [stores, deferredQuery, category, halalOnly],
  );
  const shown = groups.reduce((sum, group) => sum + group.stores.length, 0);
  const total = stores?.length ?? MALL_STORE_INDEX.malls[mallId]?.stores ?? 0;

  return (
    <section aria-label={`${mallName} store directory`} className="flex flex-col md:h-full md:min-h-0">
      <div className="sticky top-0 z-20 space-y-2 border-b border-line bg-surface px-4 py-3 md:static">
        <div className="flex items-baseline justify-between gap-2">
          <span className="data-label">Store Directory</span>
          <span className="font-mono text-[10px] text-muted">
            {stores && shown !== stores.length ? `${shown} of ${stores.length} shops` : `${total} shops`}
          </span>
        </div>
        {stores ? (
          <>
            <LayerFilterInput value={query} onChange={setQuery} placeholder="Search shops or units…" label={`Search ${mallName} shops`} />
            <div className="flex gap-1.5">
              <select
                value={category ?? ""}
                onChange={(event) => setCategory(event.target.value || null)}
                aria-label="Filter by category"
                className="min-w-0 flex-1 rounded-sm border border-line bg-paper px-2 py-1.5 text-xs text-ink outline-none hover:border-line-strong focus-visible:border-line-strong"
              >
                <option value="">All categories ({stores.length})</option>
                {categories.map(({ category: name, count }) => (
                  <option key={name} value={name}>{name} ({count})</option>
                ))}
              </select>
              {hasHalal ? (
                <button
                  type="button"
                  onClick={() => setHalalOnly((value) => !value)}
                  aria-pressed={halalOnly}
                  className={`shrink-0 rounded-sm border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] transition-colors duration-150 ${
                    halalOnly ? "border-success/45 bg-success/8 text-success" : "border-line bg-paper text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  Halal
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
        {error ? (
          <div className="flex items-center justify-center gap-3 px-3 py-6 text-xs text-muted">
            <span>Couldn&apos;t load the store directory.</span>
            <button type="button" onClick={() => void mutate()} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
              Retry
            </button>
          </div>
        ) : isLoading || !stores ? (
          <div className="px-3 py-6 text-center text-[10px] uppercase tracking-[0.1em] text-muted" role="status">Loading directory…</div>
        ) : groups.length === 0 ? (
          <div className="px-3 py-6 text-center text-[10px] uppercase tracking-[0.1em] text-muted">No shops match</div>
        ) : (
          groups.map((group) => (
            <section key={group.level ?? "unlisted"} aria-label={group.label}>
              <div className="z-10 flex items-center justify-between border-b border-line bg-surface-raised px-4 py-1.5 md:sticky md:top-0">
                <span className="data-label">{group.label}</span>
                <span className="font-mono text-[10px] text-muted">{group.stores.length}</span>
              </div>
              <ul>
                {group.stores.map((store) => (
                  <StoreRow key={`${store.name}|${store.unit ?? ""}`} store={store} />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <p className="border-t border-line px-4 py-2 text-[10px] leading-snug text-muted">
        As listed by the mall operator ({MALL_STORE_INDEX.fetchedAt}) ·{" "}
        <a href={DATA_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
          curioputterings/singapore-mall-data
        </a>{" "}
        (CC BY 4.0)
      </p>
    </section>
  );
}

function StoreRow({ store }: { store: MallStore }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b border-line px-4 py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {store.website ? (
            <a
              href={store.website}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs text-ink underline decoration-line underline-offset-2 hover:decoration-line-strong"
              title={`${store.name} website`}
            >
              {store.name}
            </a>
          ) : (
            <span className="truncate text-xs text-ink">{store.name}</span>
          )}
          {store.halal ? (
            <span className="shrink-0 rounded-sm border border-success/45 px-1 text-[9px] font-semibold uppercase tracking-[0.06em] text-success">Halal</span>
          ) : null}
        </div>
        {store.category ? <div className="truncate text-[10px] text-muted">{store.category}</div> : null}
      </div>
      {store.unit ? <span className="shrink-0 pt-px font-mono text-[10px] text-muted">{store.unit}</span> : null}
    </li>
  );
}
