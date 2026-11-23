"use client";

import { useCallback, useMemo, useState } from "react";
import { usePersistentState } from "@/app/hooks/use-persistent-state";
import {
  MRT_ROUTE_DEFAULTS,
  planMrtRoute,
  type MrtRouteMode,
  type MrtRoutePlan,
} from "@/lib/mrt-routing";
import {
  MRT_AVOID_DISRUPTIONS_KEY,
  MRT_END_KEY,
  MRT_ROUTE_MODE_KEY,
  MRT_START_KEY,
  parseMrtRouteMode,
  parseMrtStation,
  parseStoredBoolean,
} from "@/lib/ui-preferences";
import type { TrainCrowds, TrainServiceAlert } from "@/types";

export type MrtPlansByMode = Record<MrtRouteMode, MrtRoutePlan | null>;

const EMPTY_PLANS_BY_MODE: MrtPlansByMode = {
  fastest: null,
  "less-crowded": null,
  "fewest-transfers": null,
};

export function useMrtSelection() {
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
  const [routeMode, setRouteMode] = usePersistentState<MrtRouteMode>(
    MRT_ROUTE_MODE_KEY,
    MRT_ROUTE_DEFAULTS.mode,
    parseMrtRouteMode,
  );
  const [avoidDisruptions, setAvoidDisruptions] = usePersistentState<boolean>(
    MRT_AVOID_DISRUPTIONS_KEY,
    MRT_ROUTE_DEFAULTS.avoidDisruptions,
    parseStoredBoolean,
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
    hasSelection: Boolean(start || end),
    routeMode,
    setRouteMode,
    avoidDisruptions,
    setAvoidDisruptions,
    mapPickTarget,
    setMapPickTarget,
    reset,
    pickStation,
  };
}

export function useMrtRoutePlans(
  selection: Pick<
    ReturnType<typeof useMrtSelection>,
    "start" | "end" | "routeMode" | "avoidDisruptions"
  >,
  live?: {
    trainAlerts?: ReadonlyArray<TrainServiceAlert>;
    trainCrowds?: TrainCrowds;
  },
) {
  const { start, end, routeMode, avoidDisruptions } = selection;
  const trainAlerts = live?.trainAlerts;
  const trainCrowds = live?.trainCrowds;

  const plansByMode = useMemo<MrtPlansByMode>(() => {
    if (!start || !end) return EMPTY_PLANS_BY_MODE;
    const shared = { avoidDisruptions, trainAlerts, trainCrowds };
    return {
      fastest: planMrtRoute(start, end, { ...shared, mode: "fastest" }),
      "less-crowded": planMrtRoute(start, end, {
        ...shared,
        mode: "less-crowded",
      }),
      "fewest-transfers": planMrtRoute(start, end, {
        ...shared,
        mode: "fewest-transfers",
      }),
    };
  }, [start, end, avoidDisruptions, trainAlerts, trainCrowds]);

  const plan = plansByMode[routeMode];

  const detourAvailable = useMemo(() => {
    if (avoidDisruptions || !start || !end || !plan) return false;
    if (plan.disruption.lines.length === 0) return false;
    const detoured = planMrtRoute(start, end, {
      mode: routeMode,
      avoidDisruptions: true,
      trainAlerts,
      trainCrowds,
    });
    return Boolean(detoured?.detouredForDisruption);
  }, [avoidDisruptions, start, end, plan, routeMode, trainAlerts, trainCrowds]);

  return {
    plan,
    plansByMode,
    detourAvailable,
  };
}
