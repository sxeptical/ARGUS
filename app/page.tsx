"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import FeedbackWidget from "@/app/components/FeedbackWidget";
import Map, {
  EMPTY_MRT_ROUTE_SEGMENTS,
  type MapSearchTarget,
} from "@/app/components/Map";
import MapSearch, { isTypingTarget } from "@/app/components/MapSearch";
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
import {
  buildViewLinkUrl,
  DEFAULT_MAP_CAMERA,
  parseViewLinkParams,
  type MapCameraView,
} from "@/lib/view-link";
import type { AirQualityOverlay, AmenityType, RainOverlay } from "@/types";

const PLACE_SEARCH_RESULTS = [
  ...AMENITY_SEARCH_RESULTS,
  ...buildParkSearchResults(PARKS_GEOJSON),
];

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
    mrtAvoidDisruptions,
    mrtDetourAvailable,
    mrtEndStation,
    mrtMapPickTarget,
    mrtPlansByMode,
    mrtRouteMode,
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
    setMrtAvoidDisruptions,
    setMrtEndStation,
    setMrtMapPickTarget,
    setMrtRouteMode,
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
  const [rainOverlay, setRainOverlay] = useState<RainOverlay | null>(null);
  const [mapFocus, setMapFocus] = useState(false);
  const [initialCamera, setInitialCamera] = useState<MapCameraView | null>(null);
  const cameraRef = useRef<MapCameraView>(DEFAULT_MAP_CAMERA);
  const urlHydratedRef = useRef(false);
  const [theme, toggleTheme] = useTheme();

  const handleCameraChange = useCallback((camera: MapCameraView) => {
    cameraRef.current = camera;
  }, []);

  // Hydrate URL view params on initial mount so shared links override stored
  // preferences without mutating persistent storage unless the user changes them.
  useEffect(() => {
    if (urlHydratedRef.current) return;
    urlHydratedRef.current = true;
    const shared = parseViewLinkParams(window.location.search);
    if (shared.sensorVisibility) {
      setSensorVisibility(shared.sensorVisibility);
    }
    if (shared.geoFilter) {
      pickGeoFilterCenter([shared.geoFilter.center[0], shared.geoFilter.center[1]]);
      setGeoFilterRadiusM(shared.geoFilter.radiusM);
    }
    if (shared.camera) {
      cameraRef.current = shared.camera;
      queueMicrotask(() => setInitialCamera(shared.camera!));
    }
    if (shared.mapFocus) {
      queueMicrotask(() => setMapFocus(true));
    }
  }, [pickGeoFilterCenter, setGeoFilterRadiusM, setSensorVisibility]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modalOpen = document.querySelector('[aria-modal="true"]') !== null;
      if (
        event.key.toLowerCase() === "f" &&
        !isTypingTarget(event.target) &&
        !modalOpen &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        event.preventDefault();
        setMapFocus((prev) => !prev);
      } else if (
        event.key === "Escape" &&
        mapFocus &&
        !event.defaultPrevented &&
        !geoFilterPicking &&
        !modalOpen
      ) {
        event.preventDefault();
        setMapFocus(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [geoFilterPicking, mapFocus]);

  const handleCopyViewLink = useCallback(async () => {
    const url = buildViewLinkUrl(
      `${window.location.origin}${window.location.pathname}`,
      {
        camera: cameraRef.current,
        sensorVisibility,
        geoFilter,
        mapFocus,
      },
    );
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      // Fallback below when Clipboard API is unavailable or blocked.
    }
    try {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }, [geoFilter, mapFocus, sensorVisibility]);
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

  return (
    <div
      className={`flex min-h-dvh flex-col gap-2 bg-paper p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:gap-3 sm:p-3 xl:h-dvh xl:overflow-hidden ${
        mapFocus ? "h-dvh overflow-hidden" : ""
      }`}
    >
      <UpdateAvailableToast />
      <FeedbackWidget />
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
        onCopyViewLink={handleCopyViewLink}
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

      <main
        className={
          mapFocus
            ? "flex min-h-0 min-w-0 flex-1 flex-col"
            : "grid min-w-0 grid-cols-1 gap-2 sm:gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[248px_minmax(0,1fr)_292px]"
        }
      >
        <LayersSidebar
          className={mapFocus ? "hidden" : undefined}
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
          geoFilter={geoFilter}
          onAirQualityOverlayChange={setAirQualityOverlay}
          onRainOverlayChange={setRainOverlay}
          onFocusLocation={setSearchTarget}
        />

        <section
          className={
            mapFocus
              ? "flex min-h-0 min-w-0 flex-1 flex-col"
              : "contents xl:order-2 xl:grid xl:min-w-0 xl:gap-3 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(236px,38%)]"
          }
        >
          <section
            className={
              mapFocus
                ? "relative min-h-0 flex-1 overflow-hidden border border-line bg-surface"
                : "relative order-1 h-[45dvh] xl:order-none min-h-72 overflow-hidden border border-line bg-surface xl:h-auto xl:min-h-0"
            }
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
              rainOverlay={rainOverlay}
              sensorVisibility={sensorVisibility}
              amenityFilters={amenityFilters}
              onStopClick={handleSelectStop}
              onCameraClick={setSelectedCamera}
              onFlightClick={setSelectedFlight}
              onParkClick={setSelectedPark}
              onAmenityClick={setSelectedAmenity}
              onMrtStationClick={pickMrtStation}
              mrtRouteSegments={
                mrtRoutePlan?.segments ?? EMPTY_MRT_ROUTE_SEGMENTS
              }
              busRouteOverlay={busRouteOverlay}
              disruptedMrtLines={disruptedMrtLines}
              searchTarget={searchTarget}
              initialCamera={initialCamera}
              onCameraChange={handleCameraChange}
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
              alwaysShow={mapFocus}
            />
            <button
              type="button"
              onClick={() => setMapFocus((prev) => !prev)}
              aria-pressed={mapFocus}
              aria-label={mapFocus ? "Exit map focus" : "Expand map focus"}
              title={mapFocus ? "Exit map focus (F / Esc)" : "Expand map (F)"}
              className={`absolute top-11 z-10 grid h-11 w-11 place-items-center border bg-overlay transition-colors duration-150 hover:border-line-strong hover:text-ink active:bg-surface-hover sm:h-9 sm:w-9 ${
                mapFocus
                  ? "left-[6.5rem] sm:left-[5.5rem] border-info/60 text-info"
                  : "left-[6.5rem] sm:left-[5.5rem] xl:left-12 border-line text-muted"
              }`}
            >
              {mapFocus ? (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
                </svg>
              ) : (
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
                  <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
                </svg>
              )}
            </button>
            <div className="pointer-events-none absolute left-2 top-2 border border-line bg-overlay px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink">
              Live map <span className="ml-2 text-muted">Singapore</span>
              {mapFocus ? (
                <span className="ml-2 text-info">· Focus</span>
              ) : null}
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

          <section
            className={`order-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 xl:order-none 2xl:grid-cols-4 ${
              mapFocus ? "hidden" : ""
            }`}
          >
            <div className="max-h-[60dvh] min-h-0 overflow-auto xl:max-h-none">
              <MrtRoutePanel
                route={mrtRoutePlan}
                plansByMode={mrtPlansByMode}
                routeMode={mrtRouteMode}
                onRouteModeChange={setMrtRouteMode}
                avoidDisruptions={mrtAvoidDisruptions}
                onAvoidDisruptionsChange={setMrtAvoidDisruptions}
                detourAvailable={mrtDetourAvailable}
                disruptedLines={disruptedMrtLines}
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
            <div className="max-h-[60dvh] min-h-0 overflow-auto xl:max-h-none">
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
            <div className="max-h-[60dvh] min-h-0 overflow-auto xl:max-h-none">
              <NewsPanel feedStatus={feeds.news.status} news={news} />
            </div>
            <div className="max-h-[60dvh] min-h-0 overflow-auto sm:col-span-2 xl:max-h-none 2xl:col-span-1">
              <CameraPanel
                feedStatus={feeds.cameras.status}
                cameras={cameras}
                incidents={incidents}
                selectedCamera={selectedCamera}
              />
            </div>
          </section>
        </section>

        <aside
          className={`order-2 flex min-w-0 flex-col gap-2 sm:gap-3 xl:order-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1 ${
            mapFocus ? "hidden" : ""
          }`}
        >
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

          {radiusFilterPanel}
        </aside>
      </main>

      {mapFocus ? null : <DashboardFooter />}

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
