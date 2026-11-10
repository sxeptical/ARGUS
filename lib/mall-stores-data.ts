import indexData from "@/public/mall-stores/index.json";
import type { MallStoreIndex } from "@/types";

export function validateMallStoreIndex(value: unknown): value is MallStoreIndex {
  const data = value as Partial<MallStoreIndex> | null;
  return (
    typeof data?.fetchedAt === "string" &&
    !!data.malls && typeof data.malls === "object" &&
    Object.entries(data.malls).every(([id, entry]) =>
      /^[a-z0-9-]+$/.test(id) && Number.isInteger(entry?.stores) && entry.stores > 0 && typeof entry.listName === "string")
  );
}

// Built by scripts/fetch-mall-stores.ts; the per-mall lists are fetched on demand.
if (!validateMallStoreIndex(indexData)) throw new Error("Invalid mall store index");
export const MALL_STORE_INDEX = indexData as MallStoreIndex;

/** Same-origin path of a mall's store list, or null when it has none. */
export const mallStoresUrl = (mallId: string) => (MALL_STORE_INDEX.malls[mallId] ? `/mall-stores/${mallId}.json` : null);
