"use client";

import { useMemo, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import Map, { type MapSearchTarget } from "@/app/components/Map";
import MapSearch from "@/app/components/MapSearch";
import MrtRoutePanel from "@/app/components/MrtRoutePanel";
import NewsPanel from "@/app/components/NewsPanel";
import NotificationToasts from "@/app/components/NotificationToasts";
import UpdateAvailableToast from "@/app/components/UpdateAvailableToast";
import { DashboardFooter } from "@/app/components/dashboard/DashboardFooter";
import { DashboardHeader } from "@/app/components/dashboard/DashboardHeader";
import { GeoFilterPanel } from "@/app/components/dashboard/GeoFilterPanel";
import {
  IntelPanel,
  LegendDot,
  LegendSwatch,
  SignalBar,
} from "@/app/components/dashboard/IntelPanel";
import { LayersSidebar } from "@/app/components/dashboard/LayersSidebar";
import { LoadingScreen } from "@/app/components/dashboard/LoadingScreen";
import { FocusDialog } from "@/app/components/dashboard/FocusDialog";
import { MobileLayersDrawer } from "@/app/components/dashboard/MobileLayersDrawer";
import { NotificationBell } from "@/app/components/dashboard/NotificationBell";
import { useDashboardState } from "@/app/hooks/use-dashboard-state";
import { useNotifications } from "@/app/hooks/use-notifications";
import { buildHawkerSearchResults, buildMallSearchResults } from "@/lib/amenities";
import { HAWKER_CENTRES, MALLS } from "@/lib/amenities-data";
import { buildGymSearchResults } from "@/lib/gyms";
import { GYMS } from "@/lib/gyms-data";
import { buildCommunityClubSearchResults } from "@/lib/community-clubs";
import { COMMUNITY_CLUBS } from "@/lib/community-clubs-data";
import { buildPharmacySearchResults } from "@/lib/pharmacies";
import { PHARMACIES } from "@/lib/pharmacies-data";
import { buildParkSearchResults } from "@/lib/parks";
import { PARKS_GEOJSON } from "@/lib/parks-data";
import { formatRadius, withinRadius } from "@/lib/geo-filter";
import { buildBusStopSearchResults, MRT_STATION_SEARCH_RESULTS } from "@/lib/map-search";
import { LAYER_BY_KEY } from "@/lib/layers";
import { MRT_STATION_NAMES } from "@/lib/mrt-routing";
import { buildSignalDigest } from "@/lib/signals";
import type { AirQualityOverlay } from "@/types";

const AMENITY_SEARCH_RESULTS = [
  ...buildMallSearchResults(MALLS),
  ...buildHawkerSearchResults(HAWKER_CENTRES),
  ...buildGymSearchResults(GYMS),
  ...buildCommunityClubSearchResults(COMMUNITY_CLUBS),
  ...buildPharmacySearchResults(PHARMACIES),
  ...buildParkSearchResults(PARKS_GEOJSON),
];
const SEARCH_LAYER_BY_TYPE = { mall: "malls", hawker: "hawkers", gym: "gyms", "community-club": "communityClubs", pharmacy: "pharmacies", park: "parks" } as const;

export default function Home() {
  const {
    activeSources,
    allBusStops,
    allIncidents,
    bootComplete,
    busRouteOverlay,
    busRouteState,
    busStops,
    cameras,
    carparks,
    clearBusRoute,
    clearGeoFilter,
    clearSelection,
    disruptedMrtLines,
    error,
    evChargers,
    flights,
    geoFilter,
    geoFilterPicking,
    geoFilterRadiusM,
    gymBrandCountList,
    gymBrands,
    toggleGymBrand,
    resetGymBrands,
    incidents,
    handleSelectStop,
    mrtEndStation,
    mrtMapPickTarget,
    mrtRoutePlan,
    mrtStartStation,
    news,
    notificationPrefs,
    onlineSourceCount,
    pickGeoFilterCenter,
    pickMrtStation,
    resetMrtRoute,
    selectBusRouteDirection,
    selectedAmenity,
    selectedCamera,
    selectedFlight,
    selectedPark,
    selectedStop,
    sensorRows,
    sensorStatsRows,
    sensorVisibility,
    setGeoFilterPicking,
    setGeoFilterRadiusM,
    setMrtEndStation,
    setMrtMapPickTarget,
    setMrtStartStation,
    setNotificationPrefs,
    setSelectedCamera,
    setSelectedAmenity,
    setSelectedFlight,
    setSelectedPark,
    setSensorVisibility,
    showBusRoute,
    signalBars,
    signalsLoaded,
    sources,
    systemStatus,
    trainAlerts,
    visibleSensorCount,
    weather,
    weatherHistory,
  } = useDashboardState();

  const signalDigest = useMemo(
    () => buildSignalDigest({ trainAlerts, incidents, weather }),
    [trainAlerts, incidents, weather],
  );
  const allSignals = useMemo(
    () => buildSignalDigest({ trainAlerts, incidents: allIncidents, weather }),
    [trainAlerts, allIncidents, weather],
  );
  const {
    alerts,
    dismissToast,
    expireToast,
    markAlertsRead,
    toasts,
    unreadCount,
  } = useNotifications({
    signals: allSignals,
    scopedSignals: signalDigest,
    loaded: signalsLoaded,
    prefs: notificationPrefs,
  });
  const [searchTarget, setSearchTarget] = useState<MapSearchTarget | null>(null);
  const [airQualityOverlay, setAirQualityOverlay] =
    useState<AirQualityOverlay | null>(null);
  // Scope station search and pickers to the active radius filter.
  const mrtStationsInRadius = useMemo(
    () =>
      withinRadius(MRT_STATION_SEARCH_RESULTS, geoFilter, (result) => [
        result.lng,
        result.lat,
      ]),
    [geoFilter],
  );
  const mapSearchResults = useMemo(
    () => [
      ...mrtStationsInRadius,
      ...withinRadius(AMENITY_SEARCH_RESULTS, geoFilter, (result) => [result.lng, result.lat]),
      ...buildBusStopSearchResults(busStops),
    ],
    [busStops, geoFilter, mrtStationsInRadius],
  );
  const mrtRouterStations = useMemo(() => {
    if (!geoFilter) return MRT_STATION_NAMES;
    const inside = new Set(mrtStationsInRadius.map((result) => result.name));
    return MRT_STATION_NAMES.filter((station) => inside.has(station));
  }, [geoFilter, mrtStationsInRadius]);
  const searchScope = geoFilter
    ? `${formatRadius(geoFilter.radiusM)} radius`
    : undefined;
  const signalToneClass = (tone: "danger" | "warning" | "info" | "muted") =>
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : "text-muted";

  if (!bootComplete) {
    return <LoadingScreen sources={sources} />;
  }

  return (
    <div className="flex min-h-dvh flex-col gap-2 bg-paper p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-3 lg:h-dvh lg:overflow-hidden">
      <UpdateAvailableToast />
      <NotificationToasts
        toasts={toasts}
        onDismiss={dismissToast}
        onDismissAll={markAlertsRead}
        onExpire={expireToast}
      />
      <DashboardHeader
        activeSourceCount={activeSources.length}
        hasError={error !== null}
        notificationBell={
          <NotificationBell
            alerts={alerts}
            unreadCount={unreadCount}
            onMarkRead={markAlertsRead}
            prefs={notificationPrefs}
            setPrefs={setNotificationPrefs}
          />
        }
        onlineSourceCount={onlineSourceCount}
        systemStatus={systemStatus}
      />

      {error ? (
        <div
          role="status"
          className="border border-warning/40 bg-warning/8 px-3 py-2 text-xs text-warning"
        >
          {error}
        </div>
      ) : null}

      <main className="grid min-w-0 grid-cols-1 gap-2 sm:gap-3 lg:min-h-0 lg:flex-1 xl:grid-cols-[248px_minmax(0,1fr)_292px]">
        <LayersSidebar
          flights={flights}
          selectedFlight={selectedFlight}
          sensorRows={sensorRows}
          sensorStatsRows={sensorStatsRows}
          sensorVisibility={sensorVisibility}
          setSelectedFlight={setSelectedFlight}
          setSensorVisibility={setSensorVisibility}
          gymBrands={gymBrands}
          gymBrandCounts={gymBrandCountList}
          onGymBrandToggle={toggleGymBrand}
          onGymBrandReset={resetGymBrands}
          visibleSensorCount={visibleSensorCount}
          weather={weather}
          weatherHistory={weatherHistory}
          onAirQualityOverlayChange={setAirQualityOverlay}
          geoFilterPanel={
            <GeoFilterPanel
              filter={geoFilter}
              radiusM={geoFilterRadiusM}
              picking={geoFilterPicking}
              onRadiusChange={setGeoFilterRadiusM}
              onPickingChange={setGeoFilterPicking}
              onClear={clearGeoFilter}
            />
          }
        />

        <section className="contents xl:order-2 xl:grid xl:min-w-0 xl:gap-3 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(236px,38%)]">
          <section className="relative order-1 h-[45dvh] xl:order-none min-h-72 overflow-hidden border border-line bg-surface xl:h-auto xl:min-h-0">
            <Map
              busStops={busStops}
              allBusStops={allBusStops}
              cameras={cameras}
              flights={flights}
              incidents={incidents}
              carparks={carparks}
              evChargers={evChargers}
              airQualityOverlay={airQualityOverlay}
              sensorVisibility={sensorVisibility}
              gymBrands={gymBrands}
              onStopClick={handleSelectStop}
              onCameraClick={setSelectedCamera}
              onFlightClick={setSelectedFlight}
              onParkClick={setSelectedPark}
              onAmenityClick={setSelectedAmenity}
              onMrtStationClick={pickMrtStation}
              mrtRouteSegments={mrtRoutePlan?.segments ?? []}
              busRouteOverlay={busRouteOverlay}
              disruptedMrtLines={disruptedMrtLines}
              searchTarget={searchTarget}
              geoFilter={geoFilter}
              geoFilterPicking={geoFilterPicking}
              onGeoFilterPick={pickGeoFilterCenter}
            />
            <MapSearch
              results={mapSearchResults}
              scope={searchScope}
              onSelect={(result) => {
                setSearchTarget({
                  lat: result.lat,
                  lng: result.lng,
                  zoom: result.zoom,
                });
                if (result.type === "bus-stop") {
                  const stop = busStops.find((item) => item.BusStopCode === result.id);
                  if (stop) handleSelectStop(stop);
                } else if (result.type === "mall" || result.type === "hawker" || result.type === "gym" || result.type === "community-club" || result.type === "pharmacy") {
                  // Open it in focus mode, not just on the map, and make sure
                  // the searched place is actually drawn when we get there.
                  setSelectedAmenity({ type: result.type, id: result.id });
                  const layer = SEARCH_LAYER_BY_TYPE[result.type];
                  setSensorVisibility((previous) => ({ ...previous, [layer]: true }));
                  // A brand-filtered-out gym would not be drawn; switch its
                  // brand chip back on for the selection.
                  if (result.type === "gym") {
                    const gym = GYMS.find((candidate) => candidate.id === result.id);
                    if (gym) toggleGymBrand(gym.brand, true);
                  }
                } else if (result.type === "park") {
                  const park = PARKS_GEOJSON.features.find(
                    (feature) => `park:${feature.properties.name}` === result.id,
                  );
                  if (park) setSelectedPark(park.properties);
                  setSensorVisibility((previous) => ({ ...previous, parks: true }));
                }
              }}
            />
            <MobileLayersDrawer
              sensorRows={sensorRows}
              sensorVisibility={sensorVisibility}
              setSensorVisibility={setSensorVisibility}
              gymBrands={gymBrands}
              gymBrandCounts={gymBrandCountList}
              onGymBrandToggle={toggleGymBrand}
              onGymBrandReset={resetGymBrands}
              visibleSensorCount={visibleSensorCount}
            />
            <div className="pointer-events-none absolute left-2 top-2 border border-line bg-overlay px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink">
              Live map <span className="ml-2 text-muted">Singapore</span>
              {geoFilter ? (
                <span className="ml-2 text-info">· {formatRadius(geoFilter.radiusM)} radius</span>
              ) : null}
            </div>
            {geoFilterPicking ? (
              <div className="absolute left-1/2 top-2 z-10 flex -translate-x-1/2 items-center gap-2 border border-info/50 bg-overlay px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-info">
                <span className="whitespace-nowrap">Click map to set centre</span>
                <button
                  type="button"
                  onClick={() => setGeoFilterPicking(false)}
                  className="text-muted transition-colors duration-150 hover:text-ink"
                >
                  Esc
                </button>
              </div>
            ) : null}
            <div className="absolute bottom-2 left-2 right-2 flex flex-nowrap gap-x-3 gap-y-1 overflow-x-auto whitespace-nowrap sm:pointer-events-none sm:flex-wrap sm:overflow-visible border border-line bg-overlay px-2.5 py-1.5 text-[10px] uppercase tracking-[0.1em] text-muted sm:right-auto sm:max-w-[calc(100%-27rem)] sm:text-[9px]">
              {/* Legend entries come from the layer registry so a new layer's
                  legend appears here without further edits. */}
              {sensorRows.flatMap((row) => {
                if (!sensorVisibility[row.key]) return [];
                const legend = LAYER_BY_KEY.get(row.key)?.legend ?? [];
                return legend.map((item) =>
                  item.kind === "dot" ? (
                    <LegendDot
                      key={`${row.key}-${item.label}`}
                      tone={item.tone}
                      label={item.label}
                    />
                  ) : (
                    <LegendSwatch
                      key={`${row.key}-${item.label}`}
                      shape={item.shape}
                      tone={item.tone}
                      label={item.label}
                    />
                  ),
                );
              })}
            </div>
          </section>

          <section className="order-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:order-none 2xl:grid-cols-4">
            <div className="max-h-[60dvh] min-h-0 overflow-auto xl:max-h-none">
              <MrtRoutePanel
                route={mrtRoutePlan}
                startStation={mrtStartStation}
                endStation={mrtEndStation}
                onStartChange={setMrtStartStation}
                onEndChange={setMrtEndStation}
                mapPickTarget={mrtMapPickTarget}
                onMapPickTargetChange={setMrtMapPickTarget}
                onReset={resetMrtRoute}
                stations={mrtRouterStations}
                stationScope={searchScope}
              />
            </div>
            <div className="max-h-[60dvh] min-h-0 overflow-auto xl:max-h-none">
              <BusPanel
                busStops={busStops}
                searchScope={searchScope}
                selectedStop={selectedStop}
                onSelectStop={handleSelectStop}
                routeState={busRouteState}
                onShowRoute={showBusRoute}
                onClearRoute={clearBusRoute}
                onSelectRouteDirection={selectBusRouteDirection}
              />
            </div>
            <div className="max-h-[60dvh] min-h-0 overflow-auto xl:max-h-none">
              <NewsPanel news={news} />
            </div>
            <div className="max-h-[60dvh] min-h-0 overflow-auto sm:col-span-2 xl:max-h-none 2xl:col-span-1">
              <CameraPanel cameras={cameras} selectedCamera={selectedCamera} />
            </div>
          </section>
        </section>

        <aside className="order-2 flex min-w-0 flex-col gap-2 sm:gap-3 xl:order-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <IntelPanel title="Intelligence" badge={`${signalDigest.length} signals`}>
            {signalDigest.length > 0 ? (
              <div className="space-y-1">
                {signalDigest.filter((signal, index) => signal.category !== "road" || signalDigest.slice(0, index).filter((item) => item.category === "road").length < 8).map((signal, index) => (
                  <div key={`${signal.category}-${index}`} className="flex min-w-0 items-center gap-2 font-mono text-[11px] sm:text-[10px]">
                    <span className={`shrink-0 text-[10px] uppercase tracking-[0.1em] sm:text-[9px] ${signalToneClass(signal.tone)}`}>{signal.category}</span>
                    <span className="truncate text-muted" title={signal.text}>{signal.text}</span>
                  </div>
                ))}
                {incidents.length > 8 ? <div className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">+{incidents.length - 8} MORE ROAD INCIDENTS</div> : null}
              </div>
            ) : <div className="text-xs leading-relaxed text-muted">NO ACTIVE SIGNALS<br />Rail, road and weather feeds nominal.</div>}
          </IntelPanel>

          <IntelPanel
            title="Source Health"
            badge={`${onlineSourceCount}/${activeSources.length}`}
          >
            <div className="space-y-2">
              {signalBars.map((item) => (
                <SignalBar
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  tone={item.tone}
                />
              ))}
            </div>
          </IntelPanel>
        </aside>
      </main>

      <DashboardFooter />

      <FocusDialog
        key={selectedFlight?.id ?? selectedPark?.name ?? (selectedAmenity ? (selectedAmenity.type === "mall" ? selectedAmenity.mall.id : selectedAmenity.type === "hawker" ? selectedAmenity.hawker.id : selectedAmenity.type === "gym" ? selectedAmenity.gym.id : selectedAmenity.type === "community-club" ? selectedAmenity.club.id : selectedAmenity.pharmacy.id) : "none")}
        flight={selectedFlight}
        park={selectedPark}
        amenity={selectedAmenity}
        onClose={clearSelection}
      />
    </div>
  );
}
