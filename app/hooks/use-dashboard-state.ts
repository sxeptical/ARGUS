"use client";

import { useCallback, useMemo, useState } from "react";
import { useBusRoute } from "@/app/hooks/use-bus-route";
import { useDashboardSources } from "@/app/hooks/use-dashboard-sources";
import { useMrtPlanner } from "@/app/hooks/use-mrt-planner";
import { useWeatherHistory } from "@/app/hooks/use-weather-history";
import { FLIGHTS_ENABLED } from "@/lib/features";
import {
  featuresTouchingRadius,
  GEO_FILTER_DEFAULT_RADIUS_M,
  withinRadius,
  type GeoFilter,
} from "@/lib/geo-filter";
import { MRT_DISPLAY_LINE_COUNT } from "@/lib/mrt-network";
import { PARKS_GEOJSON } from "@/lib/parks-data";
import type { ParkFeatureKind } from "@/types";
import type { FlightState, TrafficCamera } from "@/types";

export type SensorKey =
  "flights" | "cameras" | "busStops" | "mrt" | "parks" | "incidents";

export type SensorRow = {
  readonly key: SensorKey;
  readonly label: string;
  readonly note: string;
  readonly value: number;
  readonly tone: string;
};

export type SensorStatsRow = Omit<SensorRow, "key">;

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
  const data = useDashboardSources();
  const busRoute = useBusRoute();
  const mrt = useMrtPlanner();
  const weatherHistory = useWeatherHistory(data.weather);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [sensorVisibility, setSensorVisibility] = useState<
    Record<SensorKey, boolean>
  >({
    flights: true,
    cameras: true,
    busStops: true,
    mrt: true,
    parks: false,
    incidents: false,
  });
  // Radius filter: `geoFilter` is null until a centre is picked on the map.
  // The radius is kept separately so it survives clearing and re-picking.
  const [geoFilterCenter, setGeoFilterCenter] = useState<
    readonly [number, number] | null
  >(null);
  const [geoFilterRadiusM, setGeoFilterRadiusM] = useState(
    GEO_FILTER_DEFAULT_RADIUS_M,
  );
  const [geoFilterPicking, setGeoFilterPicking] = useState(false);
  const geoFilter = useMemo<GeoFilter | null>(
    () =>
      geoFilterCenter
        ? { center: geoFilterCenter, radiusM: geoFilterRadiusM }
        : null,
    [geoFilterCenter, geoFilterRadiusM],
  );
  const pickGeoFilterCenter = useCallback((center: [number, number]) => {
    setGeoFilterCenter(center);
    setGeoFilterPicking(false);
  }, []);
  const clearGeoFilter = useCallback(() => {
    setGeoFilterCenter(null);
    setGeoFilterPicking(false);
  }, []);

  // Live feeds scoped to the radius. Everything downstream (map layers,
  // panels, sidebar counts, intel digest) reads these; search and selection
  // lookups keep the unfiltered `data.*` lists.
  const busStops = useMemo(
    () => withinRadius(data.busStops, geoFilter, (s) => [s.Longitude, s.Latitude]),
    [data.busStops, geoFilter],
  );
  const cameras = useMemo(
    () => withinRadius(data.cameras, geoFilter, (c) => [c.Longitude, c.Latitude]),
    [data.cameras, geoFilter],
  );
  const flights = useMemo(
    () => withinRadius(data.flights, geoFilter, (f) => [f.longitude, f.latitude]),
    [data.flights, geoFilter],
  );
  const incidents = useMemo(
    () => withinRadius(data.incidents, geoFilter, (i) => [i.lng, i.lat]),
    [data.incidents, geoFilter],
  );
  const parkCount = useMemo(
    () =>
      featuresTouchingRadius(PARKS_GEOJSON.features, geoFilter).filter(
        (feature) => feature.properties.kind === "park",
      ).length,
    [geoFilter],
  );

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
    () => summarizeFlights(flights),
    [flights],
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

  const sensorRows: SensorRow[] = [
    {
      key: "flights",
      label: "Air Activity",
      note: "live tracks",
      value: flights.length,
      tone: "text-signal-inbound",
    },
    {
      key: "cameras",
      label: "Road Cameras",
      note: "stream nodes",
      value: cameras.length,
      tone: "text-signal-camera",
    },
    {
      key: "busStops",
      label: "Bus Stops",
      note: "monitor points",
      value: busStops.length,
      tone: "text-signal-bus",
    },
    {
      key: "mrt",
      label: "MRT Network",
      note: "lines + stations",
      value: MRT_DISPLAY_LINE_COUNT,
      tone: "text-signal-mrt",
    },
    {
      key: "parks",
      label: "Recreation",
      note: "parks + trails",
      value: parkCount,
      tone: "text-signal-park",
    },
    {
      key: "incidents",
      label: "Road Incidents",
      note: "live events",
      value: incidents.length,
      tone: "text-signal-incident",
    },
  ];
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
    allBusStops: data.busStops,
    busStops,
    cameras,
    incidents,
    clearBusRoute: busRoute.clear,
    error: data.error,
    flights,
    geoFilter,
    geoFilterPicking,
    geoFilterRadiusM,
    clearGeoFilter,
    pickGeoFilterCenter,
    setGeoFilterPicking,
    setGeoFilterRadiusM,
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
