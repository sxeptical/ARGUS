"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBusRoute } from "@/app/hooks/use-bus-route";
import { useDashboardSources } from "@/app/hooks/use-dashboard-sources";
import { useMrtPlanner } from "@/app/hooks/use-mrt-planner";
import { useWeatherHistory } from "@/app/hooks/use-weather-history";
import { FLIGHTS_ENABLED } from "@/lib/features";
import {
  LAYERS,
  DEFAULT_SENSOR_VISIBILITY,
  SensorKey,
  coerceSensorVisibility,
} from "@/lib/layers";
import { readStoredJson, writeStoredJson } from "@/lib/local-history";
import { MRT_DISPLAY_LINE_COUNT } from "@/lib/mrt-network";
import { HAWKER_CENTRES, MALLS } from "@/lib/amenities-data";
import { PARK_COUNT, PARKS_GEOJSON } from "@/lib/parks-data";
import type { ParkFeatureKind } from "@/types";
import type { FlightState, TrafficCamera } from "@/types";

// v1: persisted layer on/off choices. Versioned like the weather history key
// so a future schema change can start fresh instead of migrating.
const SENSOR_VISIBILITY_STORAGE_KEY = "argus.layers.visibility.v1";

export type SensorRow = {
  readonly key: SensorKey;
  readonly label: string;
  readonly note: string;
  readonly value: number;
  readonly tone: string;
  /** Background tone class for the layer dot in the mobile drawer. */
  readonly dot: string;
};

export type SensorStatsRow = Omit<SensorRow, "key" | "dot">;

function summarizeFlights(flights: readonly FlightState[]) {
  return flights.reduce(
    (summary, flight) => {
      summary[flight.direction] += 1;
      return summary;
    },
    { inbound: 0, outbound: 0, transit: 0 },
  );
}

export function useDashboardState() {
  const [sensorVisibility, setSensorVisibility] = useState<
    Record<SensorKey, boolean>
  >(() => ({ ...DEFAULT_SENSOR_VISIBILITY }));

  // Layer choices are curated, not ephemeral: a user who turns layers off
  // shouldn't redo it after every reload, and that matters more as the layer
  // count grows. Hydration is deferred to a timer callback (the same
  // pattern as the weather history) rather than a lazy initializer so the
  // server render and the first client render agree — no hydration
  // mismatch, and no `setState` directly inside the effect body.
  const sensorVisibilityHydratedRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      sensorVisibilityHydratedRef.current = true;
      setSensorVisibility(
        coerceSensorVisibility(
          readStoredJson(SENSOR_VISIBILITY_STORAGE_KEY),
        ),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Writes wait for hydration: persisting defaults first would clobber the
  // stored choices the timer is about to load.
  useEffect(() => {
    if (!sensorVisibilityHydratedRef.current) return;
    writeStoredJson(SENSOR_VISIBILITY_STORAGE_KEY, sensorVisibility);
  }, [sensorVisibility]);

  const data = useDashboardSources({
    carparks: sensorVisibility.carparks,
    evChargers: sensorVisibility.evChargers,
  });
  const busRoute = useBusRoute();
  const mrt = useMrtPlanner();
  const weatherHistory = useWeatherHistory(data.weather);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);

  const selectedCamera = useMemo(
    () =>
      data.cameras.find((camera) => camera.CameraID === selectedCameraId) ??
      null,
    [data.cameras, selectedCameraId],
  );
  const selectedFlight = useMemo(
    () => data.flights.find((flight) => flight.id === selectedFlightId) ?? null,
    [data.flights, selectedFlightId],
  );
  const selectCamera = useCallback(
    (camera: TrafficCamera) => setSelectedCameraId(camera.CameraID),
    [],
  );
  const selectFlight = useCallback((flight: FlightState) => {
    setSelectedParkId(null);
    setSelectedFlightId(flight.id);
  }, []);
  const selectedPark = useMemo(
    () =>
      PARKS_GEOJSON.features.find(
        (feature) =>
          `${feature.properties.kind}:${feature.properties.name}` ===
          selectedParkId,
      )?.properties ?? null,
    [selectedParkId],
  );
  const selectPark = useCallback(
    (feature: {
      kind: ParkFeatureKind;
      name: string;
      park?: string;
      type?: string;
      cycle?: boolean;
    }) => {
      setSelectedFlightId(null);
      setSelectedParkId(`${feature.kind}:${feature.name}`);
    },
    [],
  );
  const flightSummary = useMemo(
    () => summarizeFlights(data.flights),
    [data.flights],
  );
  const disruptedAlerts = useMemo(
    () => data.trainAlerts.filter((alert) => alert.status === "disrupted"),
    [data.trainAlerts],
  );
  const disruptedMrtLines = useMemo(
    () =>
      [
        ...new Set(disruptedAlerts.flatMap((alert) => alert.affectedLines)),
      ].sort((a, b) => a.localeCompare(b, "en-SG")),
    [disruptedAlerts],
  );

  // Exhaustive by design: a new registry layer without a count here is a
  // type error, not a silently empty panel.
  const layerCounts: Record<SensorKey, number> = {
    flights: data.flights.length,
    cameras: data.cameras.length,
    busStops: data.busStops.length,
    mrt: MRT_DISPLAY_LINE_COUNT,
    parks: PARK_COUNT,
    incidents: data.incidents.length,
    carparks: data.carparks.length,
    evChargers: data.evChargers.length,
    malls: MALLS.length,
    hawkers: HAWKER_CENTRES.length,
  };
  const sensorRows: SensorRow[] = LAYERS.map((layer) => ({
    key: layer.key,
    label: layer.label,
    note: layer.note,
    tone: layer.tone,
    dot: layer.dot,
    value: layerCounts[layer.key],
  }));
  const sensorStatsRows: SensorStatsRow[] = [
    {
      label: "Inbound Flights",
      note: "approach vector",
      value: flightSummary.inbound,
      tone: "text-signal-inbound",
    },
    {
      label: "Outbound Flights",
      note: "departure vector",
      value: flightSummary.outbound,
      tone: "text-signal-outbound",
    },
    {
      label: "Transit Flights",
      note: "crossing tracks",
      value: flightSummary.transit,
      tone: "text-signal-transit",
    },
    {
      label: "OSINT Feed",
      note: "news stream",
      value: data.news.length,
      tone: "text-ink",
    },
  ];
  // Flights are disabled upstream: hide their toggle + stats so the panel
  // doesn't show permanently-zero controls next to live layers.
  const visibleSensorRows = FLIGHTS_ENABLED
    ? sensorRows
    : sensorRows.filter((row) => row.key !== "flights");
  const visibleSensorStatsRows = FLIGHTS_ENABLED
    ? sensorStatsRows
    : sensorStatsRows.filter((row) => !row.label.includes("Flights"));
  const visibleSensorCount = visibleSensorRows.filter(
    (row) => sensorVisibility[row.key],
  ).length;
  // Intentionally-off feeds (flights) never enter the panel: sources only
  // contains a "disabled" entry when FLIGHTS_ENABLED is false, and those
  // feeds can't recover so they don't belong in Source Health.
  const signalBars = data.sources
    .filter((source) => source.message !== "disabled")
    .map((source) => ({
      label: source.label,
      value:
        source.status === "ok" ? 100 : source.status === "loading" ? 50 : 0,
      tone:
        source.status === "ok"
          ? "bg-success"
          : source.status === "loading"
            ? "bg-warning"
            : "bg-danger",
    }));

  return {
    activeSources: data.activeSources,
    bootComplete: data.bootComplete,
    busRouteOverlay: busRoute.overlay,
    busRouteState: busRoute.state,
    busStops: data.busStops,
    cameras: data.cameras,
    incidents: data.incidents,
    carparks: data.carparks,
    evChargers: data.evChargers,
    clearBusRoute: busRoute.clear,
    error: data.error,
    flights: data.flights,
    handleSelectStop: busRoute.selectStop,
    mrtEndStation: mrt.end,
    mrtMapPickTarget: mrt.mapPickTarget,
    mrtRoutePlan: mrt.plan,
    mrtStartStation: mrt.start,
    news: data.news,
    onlineSourceCount: data.onlineSourceCount,
    pickMrtStation: mrt.pickStation,
    resetMrtRoute: mrt.reset,
    selectBusRouteDirection: busRoute.selectDirection,
    selectedCamera,
    selectedFlight,
    selectedPark,
    selectedStop: busRoute.selectedStop,
    disruptedAlerts,
    disruptedMrtLines,
    trainAlerts: data.trainAlerts,
    sensorRows: visibleSensorRows,
    sensorStatsRows: visibleSensorStatsRows,
    sensorVisibility,
    setMrtEndStation: mrt.setEnd,
    setMrtMapPickTarget: mrt.setMapPickTarget,
    setMrtStartStation: mrt.setStart,
    setSelectedCamera: selectCamera,
    setSelectedFlight: selectFlight,
    setSelectedPark: selectPark,
    setSensorVisibility,
    showBusRoute: busRoute.show,
    signalBars,
    sources: data.sources,
    systemStatus: data.error ? "Degraded" : "Live",
    visibleSensorCount,
    weather: data.weather,
    weatherHistory,
  };
}

export type DashboardState = ReturnType<typeof useDashboardState>;
