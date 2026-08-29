"use client";

import { useCallback, useMemo, useState } from "react";
import {
  MRT_ROUTE_DEFAULTS,
  planMrtRoute,
} from "@/lib/mrt-routing";

export function useMrtPlanner() {
  const [start, setStart] = useState(MRT_ROUTE_DEFAULTS.start);
  const [end, setEnd] = useState(MRT_ROUTE_DEFAULTS.end);
  const [mapPickTarget, setMapPickTarget] = useState<"start" | "end">(
    "start",
  );

  const reset = useCallback(() => {
    setStart(MRT_ROUTE_DEFAULTS.start);
    setEnd(MRT_ROUTE_DEFAULTS.end);
    setMapPickTarget("start");
  }, []);

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
    [mapPickTarget],
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
