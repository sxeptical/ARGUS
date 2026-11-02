"use client";

import { useCallback, useMemo, useState } from "react";
import { usePersistentState } from "@/app/hooks/use-persistent-state";
import {
  MRT_ROUTE_DEFAULTS,
  planMrtRoute,
} from "@/lib/mrt-routing";
import {
  MRT_END_KEY,
  MRT_START_KEY,
  parseMrtStation,
} from "@/lib/ui-preferences";

export function useMrtPlanner() {
  const [start, setStart] = usePersistentState<string>(
    MRT_START_KEY,
    MRT_ROUTE_DEFAULTS.start,
    parseMrtStation,
  );
  const [end, setEnd] = usePersistentState<string>(
    MRT_END_KEY,
    MRT_ROUTE_DEFAULTS.end,
    parseMrtStation,
  );
  const [mapPickTarget, setMapPickTarget] = useState<"start" | "end">(
    "start",
  );

  const reset = useCallback(() => {
    setStart(MRT_ROUTE_DEFAULTS.start);
    setEnd(MRT_ROUTE_DEFAULTS.end);
    setMapPickTarget("start");
  }, [setEnd, setStart]);

  const pickStation = useCallback(
    (station: string) => {
      if (mapPickTarget === "start") {
        setStart(station);
        setMapPickTarget("end");
      } else {
        setEnd(station);
        setMapPickTarget("start");
      }
    },
    [mapPickTarget, setEnd, setStart],
  );

  return {
    start,
    setStart,
    end,
    setEnd,
    mapPickTarget,
    setMapPickTarget,
    reset,
    pickStation,
    plan: useMemo(
      () => (start && end ? planMrtRoute(start, end) : null),
      [start, end],
    ),
  };
}
