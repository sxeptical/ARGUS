"use client";

import BusPanel from "@/app/components/BusPanel";
import CameraPanel from "@/app/components/CameraPanel";
import Map from "@/app/components/Map";
import MrtRoutePanel from "@/app/components/MrtRoutePanel";
import NewsPanel from "@/app/components/NewsPanel";
import UpdateAvailableToast from "@/app/components/UpdateAvailableToast";
import { DashboardHeader } from "@/app/components/dashboard/DashboardHeader";
import {
  IntelPanel,
  KeyValue,
  LegendDot,
  SignalBar,
} from "@/app/components/dashboard/IntelPanel";
import { LayersSidebar } from "@/app/components/dashboard/LayersSidebar";
import { LoadingScreen } from "@/app/components/dashboard/LoadingScreen";
import { useDashboardState } from "@/app/hooks/use-dashboard-state";
import { formatAltitudeFeet, formatSpeedKmh } from "@/lib/formatters";
import { buildSignalDigest } from "@/lib/signals";

export default function Home() {
  const {
    activeSources,
    bootComplete,
    busRouteOverlay,
    busRouteState,
    busStops,
    cameras,
    clearBusRoute,
    disruptedMrtLines,
    error,
    flights,
    incidents,
    handleSelectStop,
    mrtEndStation,
    mrtMapPickTarget,
    mrtRoutePlan,
    mrtStartStation,
    news,
    onlineSourceCount,
    pickMrtStation,
    resetMrtRoute,
    selectBusRouteDirection,
    selectedCamera,
    selectedFlight,
    selectedPark,
    selectedStop,
    sensorRows,
    sensorStatsRows,
    sensorVisibility,
    setMrtEndStation,
    setMrtMapPickTarget,
    setMrtStartStation,
    setSelectedCamera,
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
  const signalToneClass = (tone: "danger" | "warning" | "info" | "muted") =>
    tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "info" ? "text-info" : "text-muted";

  if (!bootComplete) {
    return <LoadingScreen sources={sources} />;
  }

  return (
    <div className="flex min-h-dvh flex-col gap-2 bg-paper p-2 sm:gap-3 sm:p-3 lg:h-dvh lg:overflow-hidden">
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
        />

        <section className="order-1 grid min-w-0 gap-2 sm:gap-3 xl:order-2 xl:min-h-0 xl:grid-rows-[minmax(0,1fr)_minmax(236px,38%)]">
          <section className="relative h-[52dvh] min-h-72 overflow-hidden border border-line bg-surface xl:h-auto xl:min-h-0">
            <Map
              busStops={busStops}
              cameras={cameras}
              flights={flights}
              incidents={incidents}
              sensorVisibility={sensorVisibility}
              onStopClick={handleSelectStop}
              onCameraClick={setSelectedCamera}
              onFlightClick={setSelectedFlight}
              onParkClick={setSelectedPark}
              onMrtStationClick={pickMrtStation}
              mrtRouteSegments={mrtRoutePlan?.segments ?? []}
              busRouteOverlay={busRouteOverlay}
              disruptedMrtLines={disruptedMrtLines}
            />
            <div className="pointer-events-none absolute left-2 top-2 border border-line bg-overlay px-2.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-ink">
              Live map <span className="ml-2 text-muted">Singapore</span>
            </div>
            <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap gap-x-3 gap-y-1 border border-line bg-overlay px-2.5 py-1.5 text-[9px] uppercase tracking-[0.1em] text-muted sm:right-auto">
              {sensorVisibility.flights ? <LegendDot tone="bg-signal-inbound" label="Inbound" /> : null}
              {sensorVisibility.flights ? <LegendDot tone="bg-signal-outbound" label="Outbound" /> : null}
              {sensorVisibility.flights ? <LegendDot tone="bg-signal-transit" label="Transit" /> : null}
              {sensorVisibility.busStops ? <LegendDot tone="bg-signal-bus" label="Bus" /> : null}
              {sensorVisibility.cameras ? <LegendDot tone="bg-signal-camera" label="Cameras" /> : null}
              {sensorVisibility.mrt ? <LegendDot tone="bg-signal-mrt" label="MRT" /> : null}
              {sensorVisibility.parks ? <LegendDot tone="bg-signal-park" label="Parks" /> : null}
              {sensorVisibility.incidents ? <LegendDot tone="bg-signal-incident" label="Incidents" /> : null}
            </div>
          </section>

          <section className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3 2xl:grid-cols-4">
            <div className="min-h-0 overflow-auto">
              <MrtRoutePanel
                route={mrtRoutePlan}
                startStation={mrtStartStation}
                endStation={mrtEndStation}
                onStartChange={setMrtStartStation}
                onEndChange={setMrtEndStation}
                mapPickTarget={mrtMapPickTarget}
                onMapPickTargetChange={setMrtMapPickTarget}
                onReset={resetMrtRoute}
              />
            </div>
            <div className="min-h-0 overflow-auto">
              <BusPanel
                busStops={busStops}
                selectedStop={selectedStop}
                onSelectStop={handleSelectStop}
                routeState={busRouteState}
                onShowRoute={showBusRoute}
                onClearRoute={clearBusRoute}
                onSelectRouteDirection={selectBusRouteDirection}
              />
            </div>
            <div className="min-h-0 overflow-auto">
              <NewsPanel news={news} />
            </div>
            <div className="min-h-0 overflow-auto sm:col-span-2 2xl:col-span-1">
              <CameraPanel cameras={cameras} selectedCamera={selectedCamera} />
            </div>
          </section>
        </section>

        <aside className="order-3 flex min-w-0 flex-col gap-2 sm:gap-3 xl:min-h-0 xl:overflow-y-auto xl:pr-1">
          <IntelPanel title="Intelligence" badge={`${signalDigest.length} signals`}>
            {signalDigest.length > 0 ? (
              <div className="space-y-1">
                {signalDigest.filter((signal, index) => signal.category !== "road" || signalDigest.slice(0, index).filter((item) => item.category === "road").length < 8).map((signal, index) => (
                  <div key={`${signal.category}-${index}`} className="flex min-w-0 items-center gap-2 font-mono text-[10px]">
                    <span className={`shrink-0 text-[9px] uppercase tracking-[0.1em] ${signalToneClass(signal.tone)}`}>{signal.category}</span>
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

          <IntelPanel
            title="Target Focus"
              badge={selectedFlight ? "Flight Locked" : selectedPark ? "Recreation Locked" : "Standby"}
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
                <div className="border border-line bg-paper p-2.5"><div className="font-mono text-sm font-medium text-ink">{selectedPark.name}</div><div className="data-label">{selectedPark.kind === "park" ? "PARK" : selectedPark.kind === "pcn" ? "PARK CONNECTOR" : "TRAIL"}</div></div>
                {selectedPark.park ? <KeyValue label="Park" value={selectedPark.park} /> : null}
                <KeyValue label="Access" value={selectedPark.cycle ? "CYCLING PERMITTED" : "WALKING TRAIL"} />
                {selectedPark.type ? <KeyValue label="Type" value={selectedPark.type} /> : null}
              </div>
            ) : (
              <div className="text-xs leading-relaxed text-muted">
                Select a flight or park on the map to inspect it here.
              </div>
            )}
          </IntelPanel>
        </aside>
      </main>
    </div>
  );
}
