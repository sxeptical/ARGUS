"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BusRouteOverlay } from "@/lib/map-geometry";
import { apiFetch } from "@/lib/api-fetch";
import type { BusRouteResponse, BusStop } from "@/types";

export type BusRouteUiState = {
  readonly serviceNo: string | null;
  readonly status: "idle" | "loading" | "error" | "ready";
  readonly error: string | null;
  readonly data: BusRouteResponse | null;
  readonly activeDirection: number | null;
};

export const IDLE_BUS_ROUTE_STATE: BusRouteUiState = {
  serviceNo: null,
  status: "idle",
  error: null,
  data: null,
  activeDirection: null,
};

function defaultDirection(data: BusRouteResponse): number {
  return (
    data.directions.find((direction) => direction.preferred)?.direction ??
    data.directions.find(
      (direction) => direction.selectedStopIndex !== null,
    )?.direction ??
    data.directions[0]?.direction ??
    1
  );
}

function toOverlay(state: BusRouteUiState): BusRouteOverlay | null {
  if (state.status !== "ready" || !state.data || state.activeDirection === null) {
    return null;
  }
  const direction = state.data.directions.find(
    (item) => item.direction === state.activeDirection,
  );
  if (!direction || (direction.path.length < 2 && direction.stops.length < 2)) {
    return null;
  }
  return {
    serviceNo: state.data.serviceNo,
    direction: direction.direction,
    stops: direction.stops,
    selectedStopIndex: direction.selectedStopIndex,
    path: direction.path,
    selectedPathIndex: direction.selectedPathIndex,
  };
}

export function useBusRoute() {
  const [selectedStop, setSelectedStop] = useState<BusStop | null>(null);
  const [state, setState] = useState<BusRouteUiState>(IDLE_BUS_ROUTE_STATE);
  const requestId = useRef(0);
  const abort = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    requestId.current += 1;
    abort.current?.abort();
    abort.current = null;
  }, []);

  useEffect(() => invalidate, [invalidate]);

  const selectStop = useCallback(
    (stop: BusStop) => {
      invalidate();
      setSelectedStop(stop);
      setState(IDLE_BUS_ROUTE_STATE);
    },
    [invalidate],
  );

  const show = useCallback(
    (serviceNo: string) => {
      invalidate();
      const currentRequest = requestId.current;
      const controller = new AbortController();
      abort.current = controller;
      setState({
        serviceNo,
        status: "loading",
        error: null,
        data: null,
        activeDirection: null,
      });

      const params = new URLSearchParams({ serviceNo });
      if (selectedStop) params.set("stopId", selectedStop.BusStopCode);
      void apiFetch<BusRouteResponse>(`/api/bus-routes?${params}`, {
        signal: controller.signal,
      })
        .then((data) => {
          if (currentRequest !== requestId.current) return;
          setState({
            serviceNo: data.serviceNo,
            status: "ready",
            error: null,
            data,
            activeDirection: defaultDirection(data),
          });
        })
        .catch((error: unknown) => {
          if (currentRequest !== requestId.current) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          setState({
            serviceNo,
            status: "error",
            error:
              error instanceof Error ? error.message : "Unable to load bus route",
            data: null,
            activeDirection: null,
          });
        });
    },
    [invalidate, selectedStop],
  );

  const clear = useCallback(() => {
    invalidate();
    setState(IDLE_BUS_ROUTE_STATE);
  }, [invalidate]);

  const selectDirection = useCallback((direction: number) => {
    setState((current) => {
      if (
        current.status !== "ready" ||
        !current.data?.directions.some((item) => item.direction === direction)
      ) {
        return current;
      }
      return { ...current, activeDirection: direction };
    });
  }, []);

  return {
    selectedStop,
    selectStop,
    state,
    overlay: useMemo(() => toOverlay(state), [state]),
    show,
    clear,
    selectDirection,
  };
}
