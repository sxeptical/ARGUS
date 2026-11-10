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
  LAYERS,
  DEFAULT_SENSOR_VISIBILITY,
  SensorKey,
  coerceSensorVisibility,
} from "@/lib/layers";
import { MRT_DISPLAY_LINE_COUNT } from "@/lib/mrt-network";
import { HAWKER_CENTRES, MALLS } from "@/lib/amenities-data";
import { GYMS, DEFAULT_GYM_BRAND_VISIBILITY } from "@/lib/gyms-data";
import { filterGymsByBrand, orderedGymBrandCounts } from "@/lib/gyms";
import { COMMUNITY_CLUBS } from "@/lib/community-clubs-data";
import { PHARMACIES } from "@/lib/pharmacies-data";
import { HOTELS } from "@/lib/hotels-data";
import { HERITAGE_SITES, DEFAULT_HERITAGE_KIND_VISIBILITY } from "@/lib/heritage-data";
import { filterHeritageByKind, orderedHeritageKindCounts } from "@/lib/heritage";
import { HEALTHCARE_SITES, DEFAULT_HEALTHCARE_KIND_VISIBILITY } from "@/lib/healthcare-data";
import { filterHealthcareByKind, orderedHealthcareKindCounts } from "@/lib/healthcare";
import { LIBRARIES } from "@/lib/libraries-data";
import { DEFAULT_NOTIFICATION_PREFS } from "@/lib/notifications";
import { PARKS_GEOJSON } from "@/lib/parks-data";
import {
  GEO_FILTER_CENTER_KEY,
  GEO_FILTER_RADIUS_KEY,
  GYM_BRANDS_KEY,
  HERITAGE_KINDS_KEY,
  HEALTHCARE_KINDS_KEY,
  NOTIFICATION_PREFS_KEY,
  parseGeoFilterCenter,
  parseGeoFilterRadius,
  parseNotificationPrefs,
  parseSensorVisibility,
  SENSOR_VISIBILITY_KEY,
} from "@/lib/ui-preferences";
import type { ParkFeatureKind } from "@/types";
import type {
  CommunityClub,
  FlightState,
  Gym,
  GymBrand,
  HawkerCentre,
  HealthcareKind,
  HealthcareSite,
  HeritageKind,
  HeritageSite,
  Hotel,
  Mall,
  PublicLibrary,
  Pharmacy,
  TrafficCamera,
} from "@/types";

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

/** Which static amenity the map (or search) picked, by its bundle id. */
export type AmenitySelectionTarget = { type: "mall" | "hawker" | "gym" | "community-club" | "pharmacy" | "hotel" | "heritage" | "healthcare" | "library"; id: string };

/** A selected amenity resolved to its bundle record. */
export type SelectedAmenity =
  | { type: "mall"; mall: Mall }
  | { type: "hawker"; hawker: HawkerCentre }
  | { type: "gym"; gym: Gym }
  | { type: "community-club"; club: CommunityClub }
  | { type: "pharmacy"; pharmacy: Pharmacy }
  | { type: "hotel"; hotel: Hotel }
  | { type: "heritage"; site: HeritageSite }
  | { type: "healthcare"; site: HealthcareSite }
  | { type: "library"; library: PublicLibrary };

export function useDashboardState() {
  // Declared before the sources: carparks and EV chargers only load while
  // their layer is on.
  const [sensorVisibility, setSensorVisibility] = usePersistentState<
    Record<SensorKey, boolean>
  >(
    SENSOR_VISIBILITY_KEY,
    DEFAULT_SENSOR_VISIBILITY,
    coerceSensorVisibility,
  );
  // Also declared before the sources: browser alerts need background polling.
  const [notificationPrefs, setNotificationPrefs] = usePersistentState(
    NOTIFICATION_PREFS_KEY,
    DEFAULT_NOTIFICATION_PREFS,
    parseNotificationPrefs,
  );
  // Also declared before the sources: the gym layer and its count follow it.
  const [gymBrands, setGymBrands] = usePersistentState<Record<GymBrand, boolean>>(
    GYM_BRANDS_KEY,
    DEFAULT_GYM_BRAND_VISIBILITY,
    (stored) => parseSensorVisibility(stored, DEFAULT_GYM_BRAND_VISIBILITY),
  );
  // Also declared before the sources: the heritage layer and its count follow it.
  const [heritageKinds, setHeritageKinds] = usePersistentState<Record<HeritageKind, boolean>>(
    HERITAGE_KINDS_KEY,
    DEFAULT_HERITAGE_KIND_VISIBILITY,
    (stored) => parseSensorVisibility(stored, DEFAULT_HERITAGE_KIND_VISIBILITY),
  );
  // Also declared before the sources: the healthcare layer and its count follow it.
  const [healthcareKinds, setHealthcareKinds] = usePersistentState<Record<HealthcareKind, boolean>>(
    HEALTHCARE_KINDS_KEY,
    DEFAULT_HEALTHCARE_KIND_VISIBILITY,
    (stored) => parseSensorVisibility(stored, DEFAULT_HEALTHCARE_KIND_VISIBILITY),
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
    () =>
      featuresTouchingRadius(PARKS_GEOJSON.features, geoFilter).filter(
        (feature) => feature.properties.kind === "park",
      ).length,
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
  const mallCount = useMemo(
    () => withinRadius(MALLS, geoFilter, (m) => [m.lng, m.lat]).length,
    [geoFilter],
  );
  const hawkerCount = useMemo(
    () => withinRadius(HAWKER_CENTRES, geoFilter, (h) => [h.lng, h.lat]).length,
    [geoFilter],
  );
  const gymCount = useMemo(
    () => withinRadius(filterGymsByBrand(GYMS, gymBrands), geoFilter, (g) => [g.lng, g.lat]).length,
    [geoFilter, gymBrands],
  );

  const toggleGymBrand = useCallback(
    (brand: GymBrand, on: boolean) =>
      setGymBrands((previous) => ({ ...previous, [brand]: on })),
    [setGymBrands],
  );
  const gymBrandCountList = useMemo(() => orderedGymBrandCounts(GYMS), []);
  const communityClubCount = useMemo(
    () => withinRadius(COMMUNITY_CLUBS, geoFilter, (club) => [club.lng, club.lat]).length,
    [geoFilter],
  );
  const pharmacyCount = useMemo(
    () => withinRadius(PHARMACIES, geoFilter, (pharmacy) => [pharmacy.lng, pharmacy.lat]).length,
    [geoFilter],
  );
  const hotelCount = useMemo(
    () => withinRadius(HOTELS, geoFilter, (hotel) => [hotel.lng, hotel.lat]).length,
    [geoFilter],
  );
  const heritageCount = useMemo(
    () => withinRadius(filterHeritageByKind(HERITAGE_SITES, heritageKinds), geoFilter, (site) => [site.lng, site.lat]).length,
    [geoFilter, heritageKinds],
  );

  const toggleHeritageKind = useCallback(
    (kind: HeritageKind, on: boolean) =>
      setHeritageKinds((previous) => ({ ...previous, [kind]: on })),
    [setHeritageKinds],
  );
  const heritageKindCountList = useMemo(() => orderedHeritageKindCounts(HERITAGE_SITES), []);
  const healthcareCount = useMemo(
    () => withinRadius(filterHealthcareByKind(HEALTHCARE_SITES, healthcareKinds), geoFilter, (site) => [site.lng, site.lat]).length,
    [geoFilter, healthcareKinds],
  );

  const toggleHealthcareKind = useCallback(
    (kind: HealthcareKind, on: boolean) =>
      setHealthcareKinds((previous) => ({ ...previous, [kind]: on })),
    [setHealthcareKinds],
  );
  const healthcareKindCountList = useMemo(() => orderedHealthcareKindCounts(HEALTHCARE_SITES), []);
  const libraryCount = useMemo(
    () => withinRadius(LIBRARIES, geoFilter, (library) => [library.lng, library.lat]).length,
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
  const selectedAmenity = useMemo<SelectedAmenity | null>(() => {
    if (!selectedAmenityId) return null;
    if (selectedAmenityId.type === "mall") {
      const mall =
        MALLS.find((mall) => mall.id === selectedAmenityId.id) ?? null;
      return mall ? { type: "mall", mall } : null;
    }
    if (selectedAmenityId.type === "gym") {
      const gym = GYMS.find((gym) => gym.id === selectedAmenityId.id) ?? null;
      return gym ? { type: "gym", gym } : null;
    }
    if (selectedAmenityId.type === "community-club") {
      const club =
        COMMUNITY_CLUBS.find((club) => club.id === selectedAmenityId.id) ?? null;
      return club ? { type: "community-club", club } : null;
    }
    if (selectedAmenityId.type === "pharmacy") {
      const pharmacy =
        PHARMACIES.find((pharmacy) => pharmacy.id === selectedAmenityId.id) ?? null;
      return pharmacy ? { type: "pharmacy", pharmacy } : null;
    }
    if (selectedAmenityId.type === "hotel") {
      const hotel = HOTELS.find((hotel) => hotel.id === selectedAmenityId.id) ?? null;
      return hotel ? { type: "hotel", hotel } : null;
    }
    if (selectedAmenityId.type === "heritage") {
      const site = HERITAGE_SITES.find((site) => site.id === selectedAmenityId.id) ?? null;
      return site ? { type: "heritage", site } : null;
    }
    if (selectedAmenityId.type === "healthcare") {
      const site = HEALTHCARE_SITES.find((site) => site.id === selectedAmenityId.id) ?? null;
      return site ? { type: "healthcare", site } : null;
    }
    if (selectedAmenityId.type === "library") {
      const library = LIBRARIES.find((library) => library.id === selectedAmenityId.id) ?? null;
      return library ? { type: "library", library } : null;
    }
    const hawker =
      HAWKER_CENTRES.find((hawker) => hawker.id === selectedAmenityId.id) ??
      null;
    return hawker ? { type: "hawker", hawker } : null;
  }, [selectedAmenityId]);
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
  const layerCounts: Record<SensorKey, number> = {
    flights: flights.length,
    cameras: cameras.length,
    busStops: busStops.length,
    mrt: MRT_DISPLAY_LINE_COUNT,
    parks: parkCount,
    incidents: incidents.length,
    carparks: carparks.length,
    evChargers: evChargers.length,
    malls: mallCount,
    hawkers: hawkerCount,
    gyms: gymCount,
    communityClubs: communityClubCount,
    pharmacies: pharmacyCount,
    hotels: hotelCount,
    heritage: heritageCount,
    healthcare: healthcareCount,
    libraries: libraryCount,
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
  // Hide permanently empty controls when flights are disabled upstream.
  const visibleSensorRows = FLIGHTS_ENABLED
    ? sensorRows
    : sensorRows.filter((row) => row.key !== "flights");
  const visibleSensorStatsRows = FLIGHTS_ENABLED
    ? sensorStatsRows
    : sensorStatsRows.filter((row) => !row.label.includes("Flights"));
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
    gymBrandCountList,
    gymBrands,
    heritageKindCountList,
    heritageKinds,
    setHeritageKinds,
    toggleHeritageKind,
    healthcareKindCountList,
    healthcareKinds,
    setHealthcareKinds,
    toggleHealthcareKind,
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
    setGymBrands,
    toggleGymBrand,
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
