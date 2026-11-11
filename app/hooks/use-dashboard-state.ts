"use client";

import { useCallback, useMemo, useState } from "react";
import { useBusRoute } from "@/app/hooks/use-bus-route";
import { useDashboardSources } from "@/app/hooks/use-dashboard-sources";
import { useMrtPlanner } from "@/app/hooks/use-mrt-planner";
import { usePersistentState } from "@/app/hooks/use-persistent-state";
import { useWeatherHistory } from "@/app/hooks/use-weather-history";
import { FLIGHTS_ENABLED } from "@/lib/features";
import { summarizeFlights } from "@/lib/flights";
import {
  featuresTouchingRadius,
  GEO_FILTER_DEFAULT_RADIUS_M,
  withinRadius,
  type GeoFilter,
} from "@/lib/geo-filter";
import {
  AMENITY_LAYER_BY_TYPE,
  AMENITY_LAYERS,
  findAmenity,
  parseAmenityFilters,
  visiblePlaces,
  type AmenityFilters,
  type AmenityLayerKey,
  type LayerOption,
  type OptionSelection,
} from "@/lib/amenity-layers";
import { LAYERS, DEFAULT_SENSOR_VISIBILITY, SensorKey } from "@/lib/layers";
import { MRT_DISPLAY_LINE_COUNT } from "@/lib/mrt-network";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import { PARKS_GEOJSON } from "@/lib/data/parks";
import {
  AMENITY_FILTERS_KEY,
  GEO_FILTER_CENTER_KEY,
  GEO_FILTER_RADIUS_KEY,
  NOTIFICATION_PREFS_KEY,
  parseGeoFilterCenter,
  parseGeoFilterRadius,
  parseNotificationPrefs,
  parseSensorVisibility,
  SENSOR_VISIBILITY_KEY,
} from "@/lib/ui-preferences";
import type {
  AmenityType,
  FlightState,
  ParkFeatureKind,
  TrafficCamera,
} from "@/types";

/** A layer's sub-filter chips (e.g. gym brands), ready to render. */
export type SensorRowFilter = {
  readonly label: string;
  readonly options: ReadonlyArray<LayerOption>;
  readonly selected: OptionSelection;
  readonly onChange: (next: Record<string, boolean>) => void;
};

export type SensorRow = {
  readonly key: SensorKey;
  readonly label: string;
  readonly note: string;
  readonly value: number;
  readonly tone: string;
  /** Background tone class for the layer dot in the mobile drawer. */
  readonly dot: string;
  /** Present on layers that can be narrowed further while visible. */
  readonly filter?: SensorRowFilter;
};

export type SensorStatsRow = Omit<SensorRow, "key" | "dot" | "filter">;

/** Which static amenity the map (or search) picked, by its bundle id. */
export type AmenitySelectionTarget = { type: AmenityType; id: string };

const NO_AMENITY_FILTERS: AmenityFilters = {};

// Only park polygons count toward the "Parks" layer; filtering them once
// keeps a radius-slider drag from re-walking connectors and trails too.
const PARK_FEATURES = PARKS_GEOJSON.features.filter(
  (feature) => feature.properties.kind === "park",
);

export function useDashboardState() {
  // Declared before the sources: carparks and EV chargers only load while
  // their layer is on.
  const [sensorVisibility, setSensorVisibility] = usePersistentState<
    Record<SensorKey, boolean>
  >(
    SENSOR_VISIBILITY_KEY,
    DEFAULT_SENSOR_VISIBILITY,
    (stored) => parseSensorVisibility(stored, DEFAULT_SENSOR_VISIBILITY),
  );
  // Also declared before the sources: browser alerts need background polling.
  const [notificationPrefs, setNotificationPrefs] = usePersistentState(
    NOTIFICATION_PREFS_KEY,
    DEFAULT_NOTIFICATION_PREFS,
    parseNotificationPrefs,
  );
  const [amenityFilters, setAmenityFilters] = usePersistentState(
    AMENITY_FILTERS_KEY,
    NO_AMENITY_FILTERS,
    parseAmenityFilters,
  );
  const data = useDashboardSources(
    {
      carparks: sensorVisibility.carparks,
      evChargers: sensorVisibility.evChargers,
    },
    notificationPrefs.browser,
  );
  const busRoute = useBusRoute();
  const mrt = useMrtPlanner();
  const weatherHistory = useWeatherHistory(data.weather);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [selectedAmenityId, setSelectedAmenityId] =
    useState<AmenitySelectionTarget | null>(null);
  // Keep the radius when clearing and re-picking the filter centre.
  const [geoFilterCenter, setGeoFilterCenter] = usePersistentState<
    readonly [number, number] | null
  >(GEO_FILTER_CENTER_KEY, null, parseGeoFilterCenter);
  const [geoFilterRadiusM, setGeoFilterRadiusM] = usePersistentState(
    GEO_FILTER_RADIUS_KEY,
    GEO_FILTER_DEFAULT_RADIUS_M,
    parseGeoFilterRadius,
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
  }, [setGeoFilterCenter]);
  const clearGeoFilter = useCallback(() => {
    setGeoFilterCenter(null);
    setGeoFilterPicking(false);
  }, [setGeoFilterCenter]);

  // Display filtered feeds, but keep unfiltered data for search and selection.
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
    () => featuresTouchingRadius(PARK_FEATURES, geoFilter).length,
    [geoFilter],
  );
  const carparks = useMemo(
    () => withinRadius(data.carparks, geoFilter, (c) => [c.lng, c.lat]),
    [data.carparks, geoFilter],
  );
  const evChargers = useMemo(
    () => withinRadius(data.evChargers, geoFilter, (e) => [e.lng, e.lat]),
    [data.evChargers, geoFilter],
  );
  const amenityCounts = useMemo(
    () =>
      Object.fromEntries(
        AMENITY_LAYERS.map((amenity) => [
          amenity.layer,
          withinRadius(
            [...visiblePlaces(amenity, amenityFilters)],
            geoFilter,
            (place) => [place.lng, place.lat],
          ).length,
        ]),
      ) as Record<AmenityLayerKey, number>,
    [geoFilter, amenityFilters],
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
    setSelectedAmenityId(null);
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
      setSelectedAmenityId(null);
      setSelectedParkId(`${feature.kind}:${feature.name}`);
    },
    [],
  );
  const selectAmenity = useCallback((target: AmenitySelectionTarget) => {
    setSelectedFlightId(null);
    setSelectedParkId(null);
    setSelectedAmenityId(target);
  }, []);
  /** Closes the focus dialog: nothing is locked any more. */
  const clearSelection = useCallback(() => {
    setSelectedFlightId(null);
    setSelectedParkId(null);
    setSelectedAmenityId(null);
  }, []);
  /**
   * Select an amenity that may not be drawn yet (a search hit): switch its
   * layer on, and its sub-filter option back on if that was hiding it.
   */
  const revealAmenity = useCallback(
    (target: AmenitySelectionTarget) => {
      selectAmenity(target);
      const amenity = AMENITY_LAYER_BY_TYPE.get(target.type);
      const place = amenity?.byId.get(target.id);
      if (!amenity || !place) return;
      setSensorVisibility((previous) => ({ ...previous, [amenity.layer]: true }));
      const option = amenity.filter?.of(place);
      if (option === undefined) return;
      setAmenityFilters((previous) =>
        previous[target.type]?.[option] === false
          ? { ...previous, [target.type]: { ...previous[target.type], [option]: true } }
          : previous,
      );
    },
    [selectAmenity, setAmenityFilters, setSensorVisibility],
  );
  const selectedAmenity = useMemo(
    () =>
      selectedAmenityId
        ? findAmenity(selectedAmenityId.type, selectedAmenityId.id)
        : null,
    [selectedAmenityId],
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

  // Exhaustive by design: a new registry layer without a count here is a
  // type error, not a silently empty panel.
  const layerCounts = useMemo<Record<SensorKey, number>>(
    () => ({
      flights: flights.length,
      cameras: cameras.length,
      busStops: busStops.length,
      mrt: MRT_DISPLAY_LINE_COUNT,
      parks: parkCount,
      incidents: incidents.length,
      carparks: carparks.length,
      evChargers: evChargers.length,
      ...amenityCounts,
    }),
    [
      amenityCounts,
      busStops,
      cameras,
      carparks,
      evChargers,
      flights,
      incidents,
      parkCount,
    ],
  );
  const rowFilters = useMemo(
    () =>
      new Map<SensorKey, SensorRowFilter>(
        AMENITY_LAYERS.flatMap(({ type, layer, filter }) =>
          filter
            ? [[layer, {
                label: filter.label,
                options: filter.choices,
                selected: amenityFilters[type] ?? {},
                onChange: (next: Record<string, boolean>) =>
                  setAmenityFilters((previous) => ({ ...previous, [type]: next })),
              }]]
            : [],
        ),
      ),
    [amenityFilters, setAmenityFilters],
  );
  const sensorRows = useMemo<SensorRow[]>(
    () =>
      LAYERS.map((layer) => ({
        key: layer.key,
        label: layer.label,
        note: layer.note,
        tone: layer.tone,
        dot: layer.dot,
        value: layerCounts[layer.key],
        filter: rowFilters.get(layer.key),
      })),
    [layerCounts, rowFilters],
  );
  const sensorStatsRows = useMemo<SensorStatsRow[]>(
    () => [
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
    ],
    [data.news, flightSummary],
  );
  // Hide permanently empty controls when flights are disabled upstream.
  const visibleSensorRows = useMemo(
    () =>
      FLIGHTS_ENABLED
        ? sensorRows
        : sensorRows.filter((row) => row.key !== "flights"),
    [sensorRows],
  );
  const visibleSensorStatsRows = useMemo(
    () =>
      FLIGHTS_ENABLED
        ? sensorStatsRows
        : sensorStatsRows.filter((row) => !row.label.includes("Flights")),
    [sensorStatsRows],
  );
  const visibleSensorCount = visibleSensorRows.filter(
    (row) => sensorVisibility[row.key],
  ).length;
  // Disabled feeds are not health indicators.
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
    allIncidents: data.incidents,
    busStops,
    cameras,
    incidents,
    carparks,
    evChargers,
    clearBusRoute: busRoute.clear,
    error: data.error,
    flights,
    geoFilter,
    geoFilterPicking,
    geoFilterRadiusM,
    amenityFilters,
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
    notificationPrefs,
    onlineSourceCount: data.onlineSourceCount,
    pickMrtStation: mrt.pickStation,
    resetMrtRoute: mrt.reset,
    selectBusRouteDirection: busRoute.selectDirection,
    clearSelection,
    selectedAmenity,
    selectedCamera,
    selectedFlight,
    selectedPark,
    selectedStop: busRoute.selectedStop,
    disruptedMrtLines,
    trainAlerts: data.trainAlerts,
    sensorRows: visibleSensorRows,
    sensorStatsRows: visibleSensorStatsRows,
    sensorVisibility,
    setMrtEndStation: mrt.setEnd,
    setMrtMapPickTarget: mrt.setMapPickTarget,
    setMrtStartStation: mrt.setStart,
    setNotificationPrefs,
    setSelectedCamera: selectCamera,
    setSelectedAmenity: selectAmenity,
    setSelectedFlight: selectFlight,
    setSelectedPark: selectPark,
    setSensorVisibility,
    revealAmenity,
    showBusRoute: busRoute.show,
    signalBars,
    signalsLoaded: data.signalsLoaded,
    sources: data.sources,
    systemStatus: data.error ? "Degraded" : "Live",
    visibleSensorCount,
    weather: data.weather,
    weatherHistory,
  };
}
