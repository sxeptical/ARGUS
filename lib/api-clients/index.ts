/**
 * Barrel for the external API clients, split by domain:
 *  - `http.ts`       typed HTTP + timeout + error normalization
 *  - `lta.ts`        bus stops, bus arrivals, traffic cameras, pagination
 *  - `bus-routes.ts` BusRoutes index, BusRouter geometry, route assembly
 *  - `weather.ts`    Data.gov.sg weather aggregation
 *  - `news.ts`       RSS feeds
 *  - `flights.ts`    AviationStack + OpenSky + snapshot fallback
 */
export {
  collectLtaPages,
  getBusArrivals,
  getBusStops,
  getTrafficCameras,
} from "./lta";
export { BUS_ROUTES_MAX_PAGES, getBusRoute } from "./bus-routes";
export { getWeather } from "./weather";
export { getNews } from "./news";
export { getFlights } from "./flights";
export { httpGetJson } from "./http";
