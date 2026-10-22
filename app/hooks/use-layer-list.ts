"use client";

import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { SensorRow } from "@/app/hooks/use-dashboard-state";
import {
  LAYERS,
  LAYER_BY_KEY,
  LAYER_GROUPS,
  type LayerGroupId,
  type SensorKey,
} from "@/lib/layers";

export type LayerListGroup = {
  readonly id: LayerGroupId;
  readonly label: string;
  readonly rows: ReadonlyArray<SensorRow>;
  readonly visibleCount: number;
};

function matchesFilter(
  row: SensorRow,
  groupLabel: string,
  normalized: string,
): boolean {
  return (
    row.label.toLowerCase().includes(normalized) ||
    row.note.toLowerCase().includes(normalized) ||
    groupLabel.toLowerCase().includes(normalized)
  );
}

/**
 * Pure grouping + filtering over layer rows, in display order. Exported for
 * tests: registry order wins over row order so the panel layout is defined
 * by lib/layers.ts alone, groups with no surviving rows disappear, and a
 * matching group label shows the whole group rather than matching rows.
 *
 * `normalizedFilter` is the trimmed, lower-cased query; empty disables
 * filtering.
 */
export function buildLayerGroups(
  rows: ReadonlyArray<SensorRow>,
  visibility: Record<SensorKey, boolean>,
  normalizedFilter: string,
): LayerListGroup[] {
  const filterActive = normalizedFilter.length > 0;
  const rowsByKey = new Map(rows.map((row) => [row.key, row]));
  return LAYER_GROUPS.flatMap((group) => {
    const groupRows = LAYERS.filter(
      (layer) => layer.group === group.id && rowsByKey.has(layer.key),
    ).flatMap((layer) => {
      const row = rowsByKey.get(layer.key);
      return row ? [row] : [];
    });
    const groupLabelMatches =
      filterActive && group.label.toLowerCase().includes(normalizedFilter);
    const filteredRows =
      filterActive && !groupLabelMatches
        ? groupRows.filter((row) =>
            matchesFilter(row, group.label, normalizedFilter),
          )
        : groupRows;
    if (filteredRows.length === 0) return [];
    return [
      {
        id: group.id,
        label: group.label,
        rows: filteredRows,
        visibleCount: filteredRows.filter((row) => visibility[row.key]).length,
      },
    ];
  });
}

/**
 * Grouping plus filter/collapse controls shared by the desktop sidebar and
 * the mobile drawer, so both surfaces stay in lockstep as layers accumulate.
 *
 * Rows arrive already feature-gated (e.g. flights dropped when its feed is
 * disabled upstream); grouping and group toggles only ever touch rows that
 * are actually rendered.
 */
export function useLayerList({
  rows,
  visibility,
  setVisibility,
}: {
  rows: ReadonlyArray<SensorRow>;
  visibility: Record<SensorKey, boolean>;
  setVisibility: Dispatch<SetStateAction<Record<SensorKey, boolean>>>;
}) {
  const [filter, setFilter] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<
    ReadonlySet<LayerGroupId>
  >(new Set());
  const normalizedFilter = filter.trim().toLowerCase();
  const filterActive = normalizedFilter.length > 0;

  const groups = useMemo(
    () => buildLayerGroups(rows, visibility, normalizedFilter),
    [rows, visibility, normalizedFilter],
  );

  /** All-on when any layer in the group is off, all-off otherwise. */
  const toggleGroupVisibility = useCallback(
    (id: LayerGroupId) => {
      setVisibility((previous) => {
        const groupKeys = rows
          .filter((row) => LAYER_BY_KEY.get(row.key)?.group === id)
          .map((row) => row.key);
        const anyOff = groupKeys.some((key) => !previous[key]);
        const next = { ...previous };
        for (const key of groupKeys) next[key] = anyOff;
        return next;
      });
    },
    [rows, setVisibility],
  );

  // Filtering is a find-it-quick interaction: collapsed sections would hide
  // the very rows being searched for, so filtering force-expands every group.
  const isGroupCollapsed = useCallback(
    (id: LayerGroupId) => !filterActive && collapsedGroups.has(id),
    [filterActive, collapsedGroups],
  );

  const toggleGroupCollapsed = useCallback((id: LayerGroupId) => {
    setCollapsedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return {
    groups,
    filter,
    setFilter,
    filterActive,
    isGroupCollapsed,
    toggleGroupCollapsed,
    toggleGroupVisibility,
  };
}
