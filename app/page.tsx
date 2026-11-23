"use client";

import { useMemo, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import FeedbackWidget from "@/app/components/FeedbackWidget";
import Map, {
  EMPTY_MRT_ROUTE_SEGMENTS,
  type MapSearchTarget,
} from "@/app/components/Map";
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
import { FocusDialog } from "@/app/components/dashboard/FocusDialog";
import { MobileLayersDrawer } from "@/app/components/dashboard/MobileLayersDrawer";
import { NotificationBell } from "@/app/components/dashboard/NotificationBell";
import { useDashboardState } from "@/app/hooks/use-dashboard-state";
import { useNotifications } from "@/app/hooks/use-notifications";
import { useTheme } from "@/app/hooks/use-theme";
import { AMENITY_LAYER_BY_TYPE, AMENITY_SEARCH_RESULTS } from "@/lib/amenity-layers";
import { buildParkSearchResults } from "@/lib/parks";
import { PARKS_GEOJSON } from "@/lib/data/parks";
import { formatRadius, withinRadius } from "@/lib/geo-filter";
import { buildBusStopSearchResults, isSearchResultShown, MRT_STATION_SEARCH_RESULTS } from "@/lib/map-search";
import { LAYER_BY_KEY } from "@/lib/layers";
import { MRT_STATION_NAMES } from "@/lib/mrt-routing";
import { buildSignalDigest, unknownSignalIds } from "@/lib/signals";
import type { AirQualityOverlay, AmenityType } from "@/types";

const PLACE_SEARCH_RESULTS = [
  ...AMENITY_SEARCH_RESULTS,
  ...buildParkSearchResults(PARKS_GEOJSON),
];

type MobileTab = "transit" | "signals" | "cameras" | "tools";

export default function Home() {
  const {
    activeSources,
    allBusStops,
    allIncidents,
    feeds,
    busRouteOverlay,
    busRouteState,
    busStops,
    cameras,
    carparks,
    clearBusRoute,
    clearGeoFilter,
    clearSelection,
    coLocatedWithSelection,
    disruptedMrtLines,
    error,
    evChargers,
    flights,
    geoFilter,
    geoFilterPicking,
    geoFilterRadiusM,
    amenityFilters,
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
    revealAmenity,
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
    signalsLoaded,
    systemStatus,
    trainAlerts,
    trainCrowds,
    visibleSensorCount,
    weather,
    weatherAlerts,
    weatherHistory,
  } = useDashboardState();

  const signalDigest = useMemo(
    () => buildSignalDigest({ trainAlerts, incidents, weather, weatherAlerts }),
    [trainAlerts, incidents, weather, weatherAlerts],
  );
  const allSignals = useMemo(
    () => buildSignalDigest({ trainAlerts, incidents: allIncidents, weather, weatherAlerts }),
    [trainAlerts, allIncidents, weather, weatherAlerts],
  );
  const unknownIds = useMemo(() => unknownSignalIds(weatherAlerts), [weatherAlerts]);
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
    unknownIds,
    prefs: notificationPrefs,
  });
  const [searchTarget, setSearchTarget] = useState<MapSearchTarget | null>(null);
  const [airQualityOverlay, setAirQualityOverlay] =
    useState<AirQualityOverlay | null>(null);
  const [theme, toggleTheme] = useTheme();
  const [mobileTab, setMobileTab] = useState<MobileTab>("transit");
  const [mobileLegendOpen, setMobileLegendOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  // Scope station search and pickers to the active radius filter.
  const mrtStationsInRadius = useMemo(
    () =>
      withinRadius(MRT_STATION_SEARCH_RESULTS, geoFilter, (result) => [
        result.lng,
        result.lat,
      ]),
    [geoFilter],
  );
  // Search only what the map is drawing: hidden layers and unchecked sub-filters drop out.
  const mapSearchResults = useMemo(
    () =>
      [
        ...mrtStationsInRadius,
        ...withinRadius(PLACE_SEARCH_RESULTS, geoFilter, (result) => [result.lng, result.lat]),
        ...buildBusStopSearchResults(busStops),
      ].filter((result) => isSearchResultShown(result, sensorVisibility, amenityFilters)),
    [amenityFilters, busStops, geoFilter, mrtStationsInRadius, sensorVisibility],
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
  // Radius filter lives in the right column below Source Health (see below).
  const radiusFilterPanel = (
    <GeoFilterPanel
      filter={geoFilter}
      radiusM={geoFilterRadiusM}
      picking={geoFilterPicking}
      onRadiusChange={setGeoFilterRadiusM}
      onPickingChange={setGeoFilterPicking}
      onClear={clearGeoFilter}
    />
  );

  const signalFeeds = [feeds.trainAlerts, feeds.incidents, feeds.weather, feeds.weatherAlerts];
  const signalsPending = signalFeeds.some((feed) => feed.status === "loading");
  const signalsIncomplete = signalFeeds.some((feed) => feed.status === "error" || feed.status === "stale");
  const legendItems = sensorRows.flatMap((row) => {
    if (!sensorVisibility[row.key]) return [];
    const legend = LAYER_BY_KEY.get(row.key)?.legend ?? [];
    return legend.map((item) => ({ key: `${row.key}-${item.label}`, item }));
  });

  return (
    <div className="flex min-h-dvh flex-col gap-2 bg-paper p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-3 xl:h-dvh xl:overflow-hidden">
      <UpdateAvailableToast />
      <NotificationToasts
        toasts={toasts}
        onDismiss={dismissToast}
        onDismissAll={markAlertsRead}
        onExpire={expireToast}
      />
      <DashboardHeader
        activeSourceCount={activeSources.length}
        notificationBell={
          <NotificationBell
            alerts={alerts}
            unreadCount={unreadCount}
            onMarkRead={markAlertsRead}
            prefs={notificationPrefs}
            setPrefs={setNotificationPrefs}
          />
        }
        onToggleTheme={toggleTheme}
        onlineSourceCount={onlineSourceCount}
        systemStatus={systemStatus}
        theme={theme}
      />

      {error ? (
        <div
          role="status"
          className="border border-warning/40 bg-warning/8 px-3 py-2 text-xs text-warning"
        >
          {error}
        </div>
      ) : null}

      <main className="grid min-w-0 grid-cols-1 gap-2 sm:gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[248px_minmax(0,1fr)_292px]">
        <LayersSidebar
          flights={flights}
          selectedFlight={selectedFlight}
          sensorRows={sensorRows}
          sensorStatsRows={sensorStatsRows}
          sensorVisibility={sensorVisibility}
          setSelectedFlight={setSelectedFlight}
          setSensorVisibility={setSensorVisibility}
          visibleSensorCount={visibleSensorCount}
          weatherStatus={feeds.weather.status}
          weather={weather}
          weatherAlerts={weatherAlerts}
          weatherHistory={weatherHistory}
          onAirQualityOverlayChange={setAirQualityOverlay}
          mobileVisible={mobileTab === "signals"}
        />

        <section className="contents xl:order-2 xl:grid xl:min-w-0 xl:gap-3 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(236px,38%)]">
          <section
            className={`relative order-1 h-[45dvh] min-h-72 overflow-hidden border border-line bg-surface transition-[height] duration-200 xl:order-none xl:h-auto xl:min-h-0 ${
              mapExpanded ? "max-sm:h-[75dvh] max-sm:min-h-96" : ""
            }`}
          >
            <Map
              key={theme}
              theme={theme}
              busStops={busStops}
              allBusStops={allBusStops}
              cameras={cameras}
              flights={flights}
              incidents={incidents}
              carparks={carparks}
              evChargers={evChargers}
              airQualityOverlay={airQualityOverlay}
              sensorVisibility={sensorVisibility}
              amenityFilters={amenityFilters}
              onStopClick={(stop) => {
                handleSelectStop(stop);
                setMobileTab("transit");
              }}
              onCameraClick={(camera) => {
                setSelectedCamera(camera);
                setMobileTab("cameras");
              }}
              onFlightClick={setSelectedFlight}
              onParkClick={setSelectedPark}
              onAmenityClick={setSelectedAmenity}
              onMrtStationClick={(stationName) => {
                pickMrtStation(stationName);
                setMobileTab("transit");
              }}
              mrtRouteSegments={
                mrtRoutePlan?.segments ?? EMPTY_MRT_ROUTE_SEGMENTS
              }
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
                  if (stop) {
                    handleSelectStop(stop);
                    setMobileTab("transit");
                  }
                } else if (AMENITY_LAYER_BY_TYPE.has(result.type as AmenityType)) {
                  // Open it in focus mode, not just on the map, and make sure
                  // the searched place is actually drawn when we get there.
                  revealAmenity({ type: result.type as AmenityType, id: result.id });
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
              visibleSensorCount={visibleSensorCount}
            />
            <div className="pointer-events-none absolute left-2 top-2 hidden border border-line bg-overlay px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink sm:block">
              Live map <span className="ml-2 text-muted">Singapore</span>
              {geoFilter ? (
                <span className="ml-2 text-info">· {formatRadius(geoFilter.radiusM)} radius</span>
              ) : null}
            </div>
            {geoFilter && !geoFilterPicking ? (
              <div className="pointer-events-none absolute left-2 top-14 z-10 border border-info/40 bg-overlay px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-info sm:hidden">
                {formatRadius(geoFilter.radiusM)} radius
              </div>
            ) : null}
            {geoFilterPicking ? (
              <div className="absolute inset-x-2 top-2 z-20 flex items-center justify-between gap-2 border border-info/50 bg-overlay px-2.5 py-2 text-[10px] uppercase tracking-[0.1em] text-info sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:py-1.5">
                <span className="whitespace-nowrap">
                  <span className="sm:hidden">Tap map to set centre</span>
                  <span className="hidden sm:inline">Click map to set centre</span>
                </span>
                <button
                  type="button"
                  onClick={() => setGeoFilterPicking(false)}
                  className="shrink-0 text-muted transition-colors duration-150 hover:text-ink"
                >
                  <span className="sm:hidden">Cancel</span>
                  <span className="hidden sm:inline">Esc</span>
                </button>
              </div>
            ) : null}
            <div className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 xl:hidden">
              {legendItems.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setMobileLegendOpen((previous) => !previous)}
                  aria-expanded={mobileLegendOpen}
                  className={`inline-flex h-8 items-center gap-1.5 border bg-overlay px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors duration-150 sm:hidden ${
                    mobileLegendOpen
                      ? "border-line-strong text-ink"
                      : "border-line text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  <span>Legend</span>
                  <span aria-hidden="true">{mobileLegendOpen ? "−" : "+"}</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setMapExpanded((previous) => !previous)}
                aria-pressed={mapExpanded}
                aria-label={mapExpanded ? "Shrink map" : "Expand map"}
                className="inline-flex h-8 items-center gap-1.5 border border-line bg-overlay px-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-surface-hover sm:hidden"
              >
                {mapExpanded ? "Compact" : "Expand"}
              </button>
            </div>
            {legendItems.length > 0 ? (
              <div
                className={`absolute bottom-12 left-2 right-2 z-10 flex-wrap gap-x-3 gap-y-1 border border-line bg-overlay px-2.5 py-2 text-[10px] uppercase tracking-[0.1em] text-muted sm:pointer-events-none sm:bottom-2 sm:right-auto sm:flex sm:max-w-[calc(100%-27rem)] sm:py-1.5 sm:text-[9px] ${
                  mobileLegendOpen ? "flex" : "hidden"
                }`}
              >
                {/* Legend entries come from the layer registry so a new layer's
                    legend appears here without further edits. */}
                {legendItems.map(({ key, item }) =>
                  item.kind === "dot" ? (
                    <LegendDot
                      key={key}
                      tone={item.tone}
                      label={item.label}
                    />
                  ) : (
                    <LegendSwatch
                      key={key}
                      shape={item.shape}
                      tone={item.tone}
                      label={item.label}
                    />
                  ),
                )}
              </div>
            ) : null}
          </section>

          <nav
            aria-label="Dashboard sections"
            className="order-2 grid grid-cols-4 gap-1 border border-line bg-surface p-1 xl:hidden"
          >
            {(
              [
                { id: "transit", label: "Transit" },
                {
                  id: "signals",
                  label: "Signals",
                  badge: signalDigest.length > 0 ? String(signalDigest.length) : undefined,
                },
                { id: "cameras", label: "Cameras" },
                {
                  id: "tools",
                  label: "Tools",
                  dot: Boolean(geoFilter),
                },
              ] as ReadonlyArray<{
                id: MobileTab;
                label: string;
                badge?: string;
                dot?: boolean;
              }>
            ).map((tab) => {
              const active = mobileTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMobileTab(tab.id)}
                  className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-sm border px-2 font-mono text-[10px] font-medium uppercase tracking-[0.1em] transition-colors duration-150 ${
                    active
                      ? "border-line-strong bg-surface-raised text-ink"
                      : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.badge ? (
                    <span className="rounded-sm bg-danger/15 px-1 py-px text-[9px] leading-none text-danger">
                      {tab.badge}
                    </span>
                  ) : null}
                  {tab.dot ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-info" aria-hidden="true" />
                  ) : null}
                </button>
              );
            })}
          </nav>

          <section
            className={`order-5 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:order-none xl:grid 2xl:grid-cols-4 ${
              mobileTab === "tools" ? "max-xl:hidden" : ""
            }`}
          >
            <div
              className={`min-h-0 xl:overflow-auto ${
                mobileTab === "transit" ? "" : "max-xl:hidden"
              }`}
            >
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
                trainCrowds={trainCrowds}
              />
            </div>
            <div
              className={`min-h-0 xl:overflow-auto ${
                mobileTab === "transit" ? "" : "max-xl:hidden"
              }`}
            >
              <BusPanel
                feedStatus={feeds.busStops.status}
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
            <div
              className={`min-h-0 xl:overflow-auto ${
                mobileTab === "signals" ? "sm:col-span-2 xl:col-span-1" : "max-xl:hidden"
              }`}
            >
              <NewsPanel feedStatus={feeds.news.status} news={news} />
            </div>
            <div
              className={`min-h-0 sm:col-span-2 xl:overflow-auto 2xl:col-span-1 ${
                mobileTab === "cameras" ? "" : "max-xl:hidden"
              }`}
            >
              <CameraPanel feedStatus={feeds.cameras.status} cameras={cameras} selectedCamera={selectedCamera} />
            </div>
          </section>
        </section>

        <aside
          className={`order-3 flex min-w-0 flex-col gap-2 sm:gap-3 xl:order-3 xl:flex xl:min-h-0 xl:overflow-y-auto xl:pr-1 ${
            mobileTab === "signals" || mobileTab === "tools" ? "" : "max-xl:hidden"
          }`}
        >
          <div className={mobileTab === "signals" ? "" : "max-xl:hidden"}>
            <IntelPanel title="Intelligence" badge={signalsPending ? "Updating" : signalsIncomplete ? "Partial" : `${signalDigest.length} signals`}>
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
              ) : <div className="text-xs leading-relaxed text-muted">
                {signalsPending ? "Checking rail, road, weather and storm feeds…" :
                  signalsIncomplete ? "No active signals in the available data. Some feeds could not refresh." :
                  <>NO ACTIVE SIGNALS<br />Rail, road, weather and storm feeds nominal.</>}
              </div>}
            </IntelPanel>
          </div>

          <div className={`flex flex-col gap-2 sm:gap-3 ${mobileTab === "tools" ? "" : "max-xl:hidden"}`}>
            {radiusFilterPanel}

            <IntelPanel
              title="Source Health"
              badge={`${onlineSourceCount}/${activeSources.length}`}
            >
              <div className="space-y-2">
                {activeSources.map((item) => (
                  <SignalBar
                    key={item.label}
                    label={item.label}
                    status={item.status}
                  />
                ))}
              </div>
            </IntelPanel>
          </div>
        </aside>
      </main>

      <DashboardFooter left={<FeedbackWidget />} />

      <FocusDialog
        key={selectedFlight?.id ?? selectedPark?.name ?? (selectedAmenity ? `${selectedAmenity.type}:${selectedAmenity.place.id}` : "none")}
        flight={selectedFlight}
        park={selectedPark}
        amenity={selectedAmenity}
        alsoHere={coLocatedWithSelection}
        onSelectAmenity={setSelectedAmenity}
        onClose={clearSelection}
      />
    </div>
  );
}
