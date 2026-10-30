"use client";

import { useMemo, useState } from "react";
import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import Map, { type MapSearchTarget } from "@/app/components/Map";
import MapSearch from "@/app/components/MapSearch";
import MrtRoutePanel from "@/app/components/MrtRoutePanel";
import NewsPanel from "@/app/components/NewsPanel";
import UpdateAvailableToast from "@/app/components/UpdateAvailableToast";
import { DashboardHeader } from "@/app/components/dashboard/DashboardHeader";
import { GeoFilterPanel } from "@/app/components/dashboard/GeoFilterPanel";
import {
  IntelPanel,
  KeyValue,
  LegendDot,
  LegendSwatch,
  SignalBar,
} from "@/app/components/dashboard/IntelPanel";
import { LayersSidebar } from "@/app/components/dashboard/LayersSidebar";
import { LoadingScreen } from "@/app/components/dashboard/LoadingScreen";
import { MobileLayersDrawer } from "@/app/components/dashboard/MobileLayersDrawer";
import { PlacePhotoGallery } from "@/app/components/dashboard/PlacePhotoGallery";
import { useDashboardState } from "@/app/hooks/use-dashboard-state";
import { formatAltitudeFeet, formatSpeedKmh } from "@/lib/formatters";
import { buildHawkerSearchResults, buildMallSearchResults, formatOpeningHours } from "@/lib/amenities";
import { HAWKER_CENTRES, MALLS } from "@/lib/amenities-data";
import { buildParkSearchResults, PARK_KIND_TITLE } from "@/lib/parks";
import { PARKS_GEOJSON } from "@/lib/parks-data";
import { formatRadius, withinRadius } from "@/lib/geo-filter";
import { buildBusStopSearchResults, MRT_STATION_SEARCH_RESULTS } from "@/lib/map-search";
import { MRT_STATION_NAMES } from "@/lib/mrt-routing";
import { buildSignalDigest } from "@/lib/signals";
import type { AirQualityOverlay } from "@/types";

const AMENITY_SEARCH_RESULTS = [
  ...buildMallSearchResults(MALLS),
  ...buildHawkerSearchResults(HAWKER_CENTRES),
  ...buildParkSearchResults(PARKS_GEOJSON),
];
const SEARCH_LAYER_BY_TYPE = { mall: "malls", hawker: "hawkers", park: "parks" } as const;

export default function Home() {
  const {
    activeSources,
    allBusStops,
    bootComplete,
    busRouteOverlay,
    busRouteState,
    busStops,
    cameras,
    carparks,
    clearBusRoute,
    clearGeoFilter,
    disruptedMrtLines,
    error,
    evChargers,
    flights,
    geoFilter,
    geoFilterPicking,
    geoFilterRadiusM,
    incidents,
    handleSelectStop,
    mrtEndStation,
    mrtMapPickTarget,
    mrtRoutePlan,
    mrtStartStation,
    news,
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
    setSelectedCamera,
    setSelectedAmenity,
    setSelectedFlight,
    setSelectedPark,
    setSensorVisibility,
    showBusRoute,
    signalBars,
    sources,
    systemStatus,
    trainAlerts,
    visibleSensorCount,
    weather,
    weatherHistory,
  } = useDashboardState();

  const signalDigest = buildSignalDigest({ trainAlerts, incidents, weather });
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
      <DashboardHeader
        activeSourceCount={activeSources.length}
        hasError={error !== null}
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
                } else if (result.type === "mall" || result.type === "hawker") {
                  // Land in Target Focus, not just on the map, and make sure
                  // the searched place is actually drawn when we get there.
                  setSelectedAmenity({ type: result.type, id: result.id });
                  const layer = SEARCH_LAYER_BY_TYPE[result.type];
                  setSensorVisibility((previous) => ({ ...previous, [layer]: true }));
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
              {sensorVisibility.flights ? <LegendDot tone="bg-signal-inbound" label="Inbound" /> : null}
              {sensorVisibility.flights ? <LegendDot tone="bg-signal-outbound" label="Outbound" /> : null}
              {sensorVisibility.flights ? <LegendDot tone="bg-signal-transit" label="Transit" /> : null}
              {sensorVisibility.busStops ? <LegendDot tone="bg-signal-bus" label="Bus" /> : null}
              {sensorVisibility.cameras ? <LegendDot tone="bg-signal-camera" label="Cameras" /> : null}
              {sensorVisibility.mrt ? <LegendDot tone="bg-signal-mrt" label="MRT" /> : null}
              {sensorVisibility.parks ? <LegendSwatch shape="area" tone="border-signal-park bg-signal-park/30" label="Parks" /> : null}
              {sensorVisibility.parks ? <LegendSwatch shape="line" tone="bg-signal-park" label="Park connectors" /> : null}
              {sensorVisibility.parks ? <LegendSwatch shape="dashed" tone="border-signal-park" label="Trails" /> : null}
              {sensorVisibility.incidents ? <LegendDot tone="bg-signal-incident" label="Incidents" /> : null}
              {sensorVisibility.carparks ? <LegendDot tone="bg-signal-carpark" label="Carparks" /> : null}
              {sensorVisibility.evChargers ? <LegendDot tone="bg-signal-ev" label="EV" /> : null}
              {sensorVisibility.malls ? <LegendDot tone="bg-signal-mall" label="Malls" /> : null}
              {sensorVisibility.hawkers ? <LegendDot tone="bg-signal-hawker" label="Hawkers" /> : null}
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

          <div className="order-first xl:order-none">
          <IntelPanel
            title="Target Focus"
              badge={selectedFlight ? "Flight Locked" : selectedPark ? "Park Locked" : selectedAmenity ? (selectedAmenity.type === "mall" ? "Mall Locked" : "Hawker Locked") : "Standby"}
          >
            {selectedFlight ? (
              <div className="space-y-2 text-xs">
                <div className="border border-line bg-paper p-2.5">
                  <div className="font-mono text-sm font-medium text-ink">
                    {selectedFlight.callsign}
                  </div>
                  <div className="data-label">
                    {selectedFlight.originCountry}
                  </div>
                </div>
                <KeyValue
                  label="Direction"
                  value={selectedFlight.direction.toUpperCase()}
                />
                <KeyValue
                  label="Altitude"
                  value={formatAltitudeFeet(selectedFlight.altitude)}
                />
                <KeyValue
                  label="Speed"
                  value={formatSpeedKmh(selectedFlight.velocity)}
                />
                <KeyValue
                  label="Track"
                  value={
                    selectedFlight.track !== null
                      ? `${Math.round(selectedFlight.track)}°`
                      : "N/A"
                  }
                />
              </div>
            ) : selectedPark ? (
              <div className="space-y-2 text-xs">
                <div className="border border-line bg-paper p-2.5"><div className="font-mono text-sm font-medium text-ink">{selectedPark.name}</div><div className="data-label">{PARK_KIND_TITLE[selectedPark.kind]}</div></div>
                {selectedPark.kind === "park" && selectedPark.areaHa ? <KeyValue label="Size" value={`${selectedPark.areaHa.toLocaleString("en-SG")} ha`} /> : null}
                {selectedPark.kind === "pcn" ? <KeyValue label="Use" value="Walking, running, cycling" /> : null}
                {selectedPark.kind === "trail" && selectedPark.park ? <KeyValue label="Park" value={selectedPark.park} /> : null}
                {selectedPark.kind === "trail" ? <KeyValue label="Access" value={selectedPark.cycle ? "Walking and cycling" : "Walking only"} /> : null}
                {selectedPark.kind === "trail" && selectedPark.type ? <KeyValue label="Type" value={selectedPark.type} /> : null}
              </div>
            ) : selectedAmenity ? (
              <div className="space-y-2 text-xs">
                {selectedAmenity.type === "mall" ? (
                  <>
                    <div className="border border-line bg-paper p-2.5"><div className="font-mono text-sm font-medium text-ink">{selectedAmenity.mall.name}</div><div className="data-label">Shopping Mall</div></div>
                    <PlacePhotoGallery key={selectedAmenity.mall.id} name={selectedAmenity.mall.name} photos={selectedAmenity.mall.photos} />
                    {selectedAmenity.mall.stores !== null ? <KeyValue label="Shops" value={selectedAmenity.mall.stores.toLocaleString("en-SG")} /> : null}
                    {selectedAmenity.mall.fnb !== null ? <KeyValue label="Food & Drink" value={selectedAmenity.mall.fnb.toLocaleString("en-SG")} /> : null}
                    {selectedAmenity.mall.nearestMrt ? <KeyValue label="Nearest MRT" value={selectedAmenity.mall.nearestMrt} /> : null}
                    {selectedAmenity.mall.openingHours ? <KeyValue label="Hours" value={formatOpeningHours(selectedAmenity.mall.openingHours) ?? selectedAmenity.mall.openingHours} /> : null}
                    {selectedAmenity.mall.address ? <KeyValue label="Address" value={selectedAmenity.mall.address} /> : null}
                  </>
                ) : (
                  <>
                    <div className="border border-line bg-paper p-2.5"><div className="font-mono text-sm font-medium text-ink">{selectedAmenity.hawker.name}</div><div className="data-label">Hawker Centre</div></div>
                    <PlacePhotoGallery key={selectedAmenity.hawker.id} name={selectedAmenity.hawker.name} photos={selectedAmenity.hawker.photos} />
                    {selectedAmenity.hawker.status === "planned" ? <KeyValue label="Status" value={selectedAmenity.hawker.expectedYear ? `Under construction · expected ${selectedAmenity.hawker.expectedYear}` : "Under construction"} /> : <KeyValue label="Status" value="In operation" />}
                    {selectedAmenity.hawker.stalls !== null ? <KeyValue label="Stalls" value={`${selectedAmenity.hawker.stalls.toLocaleString("en-SG")} cooked food`} /> : null}
                    {selectedAmenity.hawker.address ? <KeyValue label="Address" value={selectedAmenity.hawker.address} /> : null}
                  </>
                )}
              </div>
            ) : (
              <div className="text-xs leading-relaxed text-muted">
                Select a flight, park or amenity on the map to inspect it here.
              </div>
            )}
          </IntelPanel>
          </div>
        </aside>
      </main>

    </div>
  );
}
