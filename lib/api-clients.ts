import { cachedFetch } from "@/lib/cache";
import type {
  BusArrival,
  BusStop,
  FlightDirection,
  FlightState,
  NewsItem,
  TrafficCamera,
  WeatherData,
} from "@/types";

const LTA_BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice";
const DATA_GOV_BASE_URL = "https://api.data.gov.sg/v1/environment";
const AVIATIONSTACK_BASE_URL = "https://api.aviationstack.com/v1";
const OPENSKY_BASE_URL = "https://opensky-network.org/api";
const FETCH_TIMEOUT_MS = 10_000;

function getLtaApiKey(): string {
  const apiKey = process.env.LTA_API_KEY;
  if (!apiKey) {
    throw new Error("Missing LTA_API_KEY");
  }
  return apiKey;
}

function getAviationStackApiKey(): string {
  const apiKey = process.env.AVIATIONSTACK_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing AVIATIONSTACK_API_KEY");
  }
  return apiKey;
}

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function ltaFetch<T>(endpoint: string): Promise<T | null> {
  const response = await fetchWithTimeout(`${LTA_BASE_URL}${endpoint}`, {
    headers: {
      AccountKey: getLtaApiKey(),
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`LTA request failed (${response.status}) for ${endpoint}`);
  }

  return response.json() as Promise<T>;
}

const BUS_STOP_ID_RE = /^\d{5}$/;

export async function getBusStops(): Promise<BusStop[]> {
  return cachedFetch("bus-stops", async () => {
    const allStops: BusStop[] = [];
    let skip = 0;

    while (true) {
      const page = await ltaFetch<{ value: BusStop[] }>(`/BusStops?$skip=${skip}`);
      if (!page || !Array.isArray(page.value)) break;
      allStops.push(...page.value);

      if (page.value.length === 0) {
        break;
      }

      skip += page.value.length;
    }

    return allStops;
  }, 24 * 60 * 60 * 1000);
}

export async function getBusArrivals(stopId: string): Promise<BusArrival[]> {
  if (!BUS_STOP_ID_RE.test(stopId)) {
    throw new Error("Invalid bus stop code");
  }

  return cachedFetch(`bus-arrivals-${stopId}`, async () => {
    const busStopCode = encodeURIComponent(stopId);
    const primary = await ltaFetch<{ Services: BusArrival[] }>(
      `/v3/BusArrival?BusStopCode=${busStopCode}`,
    );

    if (primary?.Services) {
      return primary.Services;
    }

    // Backward-compatibility fallback for older tenants/environments.
    const fallback = await ltaFetch<{ Services: BusArrival[] }>(
      `/BusArrivalv2?BusStopCode=${busStopCode}`,
    );
    return fallback?.Services ?? [];
  }, 15 * 1000);
}

type RawTrafficImage = {
  CameraID: string;
  Latitude: number;
  Longitude: number;
  ImageLink: string;
};

type TrafficImageResponse =
  | { value: RawTrafficImage[] }
  | { value: Array<{ Cameras: RawTrafficImage[] }> };

function hasCameras(
  entry: RawTrafficImage | { Cameras: RawTrafficImage[] },
): entry is { Cameras: RawTrafficImage[] } {
  return typeof entry === "object" && entry !== null && "Cameras" in entry;
}

export async function getTrafficCameras(): Promise<TrafficCamera[]> {
  return cachedFetch("traffic-cameras", async () => {
    const payload = await ltaFetch<TrafficImageResponse>("/Traffic-Imagesv2");
    if (!payload) return [];

    const value = payload.value ?? [];
    const cameras = Array.isArray(value) && value.length > 0 && hasCameras(value[0])
      ? value.flatMap((entry) => (hasCameras(entry) ? entry.Cameras : []))
      : (value as RawTrafficImage[]);

    return cameras.map((camera) => ({
      ...camera,
      location: `Camera ${camera.CameraID}`,
    }));
  }, 60 * 1000);
}

type ForecastResponse = {
  area_metadata?: Array<{ name: string }>;
  items?: Array<{
    forecasts?: Array<{ area: string; forecast: string }>;
  }>;
};

type PsiResponse = {
  items?: Array<{
    readings?: {
      psi_twenty_four_hourly?: {
        national?: number;
      };
    };
  }>;
};

type TemperatureResponse = {
  items?: Array<{
    readings?: Array<{ value: number }>;
  }>;
};

function getPsiStatus(psi: number): "Good" | "Moderate" | "Unhealthy" {
  if (psi <= 50) return "Good";
  if (psi <= 100) return "Moderate";
  return "Unhealthy";
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((acc, item) => acc + item, 0) / values.length);
}

export async function getWeather(): Promise<WeatherData> {
  return cachedFetch("weather", async () => {
    const [forecastResponse, psiResponse, temperatureResponse] = await Promise.all([
      fetchWithTimeout(`${DATA_GOV_BASE_URL}/2-hour-weather-forecast`, { cache: "no-store" }),
      fetchWithTimeout(`${DATA_GOV_BASE_URL}/psi`, { cache: "no-store" }),
      fetchWithTimeout(`${DATA_GOV_BASE_URL}/air-temperature`, { cache: "no-store" }),
    ]);

    if (!forecastResponse.ok || !psiResponse.ok || !temperatureResponse.ok) {
      throw new Error("Failed to fetch weather resources from data.gov.sg");
    }

    const forecastData = (await forecastResponse.json()) as ForecastResponse;
    const psiData = (await psiResponse.json()) as PsiResponse;
    const temperatureData = (await temperatureResponse.json()) as TemperatureResponse;

    const area = forecastData.area_metadata?.[0]?.name ?? "Singapore";
    const forecast =
      forecastData.items?.[0]?.forecasts?.find((item) => item.area === area)?.forecast ??
      "No forecast available";

    const psi = psiData.items?.[0]?.readings?.psi_twenty_four_hourly?.national ?? 0;
    const readings = temperatureData.items?.[0]?.readings?.map((reading) => reading.value) ?? [];

    return {
      temperature: average(readings),
      humidity: 0,
      psi,
      psiStatus: getPsiStatus(psi),
      forecast,
      lastUpdated: new Date().toISOString(),
    };
  }, 5 * 60 * 1000);
}

const SAFE_URL_RE = /^https?:\/\//i;

function parseRssItems(xml: string, source: string): NewsItem[] {
  const itemMatches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

  return itemMatches
    .map((rawItem) => {
      const title = extractRssTag(rawItem, "title");
      const link = extractRssTag(rawItem, "link");
      const publishedAt = extractRssTag(rawItem, "pubDate");

      if (!title || !link) {
        return null;
      }

      if (!SAFE_URL_RE.test(link)) {
        return null;
      }

      return {
        title,
        source,
        url: link,
        publishedAt: new Date(publishedAt || Date.now()).toISOString(),
      } satisfies NewsItem;
    })
    .filter((item): item is NewsItem => item !== null);
}

function extractRssTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  if (!match?.[1]) return "";

  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

export async function getNews(): Promise<NewsItem[]> {
  return cachedFetch("news", async () => {
    const rssFeeds = [
      { source: "The Straits Times", url: "https://www.straitstimes.com/news/singapore/rss.xml" },
      { source: "CNA", url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml" },
    ] as const;

    const rssResults = await Promise.all(
      rssFeeds.map(async ({ source, url }) => {
        try {
          const response = await fetchWithTimeout(url, { cache: "no-store" });
          if (!response.ok) return [];
          const xml = await response.text();
          return parseRssItems(xml, source);
        } catch {
          return [];
        }
      }),
    );

    const merged = rssResults.flat();
    if (merged.length > 0) {
      return merged
        .sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt))
        .slice(0, 20);
    }

    return [
      {
        title: "News feeds are currently unavailable",
        source: "System",
        url: "#",
        publishedAt: new Date().toISOString(),
      },
    ];
  }, 15 * 60 * 1000);
}

type AviationStackFlight = {
  departure?: {
    airport?: string | null;
    iata?: string | null;
    icao?: string | null;
  } | null;
  arrival?: {
    airport?: string | null;
    iata?: string | null;
    icao?: string | null;
  } | null;
  airline?: {
    name?: string | null;
    iata?: string | null;
  } | null;
  flight?: {
    number?: string | null;
    iata?: string | null;
    icao?: string | null;
  } | null;
  aircraft?: {
    registration?: string | null;
    icao24?: string | null;
  } | null;
  live?: {
    updated?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    altitude?: number | null; // meters
    direction?: number | null; // degrees
    speed_horizontal?: number | null; // km/h
    speed_vertical?: number | null; // km/h
    is_ground?: boolean | null;
  } | null;
};

type AviationStackResponse = {
  data?: AviationStackFlight[];
  error?: {
    code?: string | number;
    type?: string;
    info?: string;
  };
};

type OpenSkyResponse = {
  time: number;
  states: Array<
    [
      string | null,
      string | null,
      string | null,
      number | null,
      number | null,
      number | null,
      number | null,
      number | null,
      boolean | null,
      number | null,
      number | null,
      number | null,
      unknown,
      number | null,
      string | null,
      boolean | null,
      number | null,
      number | null,
    ]
  > | null;
};

const SG_BOUNDS = {
  lamin: 1.15,
  lomin: 103.45,
  lamax: 1.50,
  lomax: 104.15,
};

const FLIGHTS_FALLBACK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes
let lastSuccessfulFlights: FlightState[] = [];
let lastSuccessfulFlightsAt = 0;

const CHANGI_COORDS = { lat: 1.3644, lon: 103.9915 };
const SG_AIRPORT_ICAO = new Set(["WSSS", "WSSL"]);
const SG_AIRPORT_IATA = new Set(["SIN", "XSP"]);

function normalizeHeading(angle: number): number {
  const value = angle % 360;
  return value < 0 ? value + 360 : value;
}

function absoluteBearingDiff(a: number, b: number): number {
  const diff = Math.abs(normalizeHeading(a) - normalizeHeading(b));
  return diff > 180 ? 360 - diff : diff;
}

function bearingDegrees(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const fromLatRad = (fromLat * Math.PI) / 180;
  const fromLonRad = (fromLon * Math.PI) / 180;
  const toLatRad = (toLat * Math.PI) / 180;
  const toLonRad = (toLon * Math.PI) / 180;

  const dLon = toLonRad - fromLonRad;
  const y = Math.sin(dLon) * Math.cos(toLatRad);
  const x =
    Math.cos(fromLatRad) * Math.sin(toLatRad) -
    Math.sin(fromLatRad) * Math.cos(toLatRad) * Math.cos(dLon);
  const theta = Math.atan2(y, x);
  return normalizeHeading((theta * 180) / Math.PI);
}

function classifyFlightDirection(
  latitude: number,
  longitude: number,
  track: number | null,
): FlightDirection {
  if (track === null) return "transit";

  const headingToChangi = bearingDegrees(
    latitude,
    longitude,
    CHANGI_COORDS.lat,
    CHANGI_COORDS.lon,
  );
  const diff = absoluteBearingDiff(track, headingToChangi);

  if (diff <= 55) return "inbound";
  if (diff >= 125) return "outbound";
  return "transit";
}

function normalizeCode(code?: string | null): string {
  return (code ?? "").trim().toUpperCase();
}

function isSingaporeAirport(icao?: string | null, iata?: string | null): boolean {
  const normalizedIcao = normalizeCode(icao);
  const normalizedIata = normalizeCode(iata);
  return SG_AIRPORT_ICAO.has(normalizedIcao) || SG_AIRPORT_IATA.has(normalizedIata);
}

function toFlightStateFromAviationStack(item: AviationStackFlight): FlightState | null {
  const live = item.live;
  const latitude = live?.latitude;
  const longitude = live?.longitude;
  const onGround = live?.is_ground ?? false;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || onGround) {
    return null;
  }

  const flightLatitude = latitude as number;
  const flightLongitude = longitude as number;
  const flightTrack = Number.isFinite(live?.direction) ? (live?.direction as number) : null;

  const depIsSingapore = isSingaporeAirport(item.departure?.icao, item.departure?.iata);
  const arrIsSingapore = isSingaporeAirport(item.arrival?.icao, item.arrival?.iata);
  const direction: FlightDirection = arrIsSingapore && !depIsSingapore
    ? "inbound"
    : depIsSingapore && !arrIsSingapore
      ? "outbound"
      : classifyFlightDirection(flightLatitude, flightLongitude, flightTrack);

  const flightCode = item.flight?.icao?.trim()
    || item.flight?.iata?.trim()
    || `${item.airline?.iata?.trim() ?? ""}${item.flight?.number?.trim() ?? ""}`.trim();
  const icao24 = item.aircraft?.icao24?.trim()
    || item.aircraft?.registration?.trim()
    || flightCode
    || "unknown";
  const callsign = flightCode || icao24.toUpperCase();

  const velocityKmh = live?.speed_horizontal;
  const verticalKmh = live?.speed_vertical;
  const velocity = Number.isFinite(velocityKmh) ? (velocityKmh as number) / 3.6 : null;
  const verticalRate = Number.isFinite(verticalKmh) ? (verticalKmh as number) / 3.6 : null;
  const altitude = Number.isFinite(live?.altitude) ? (live?.altitude as number) : null;
  const lastContactMs = live?.updated ? Date.parse(live.updated) : Number.NaN;
  const lastContact = Number.isFinite(lastContactMs) ? Math.floor(lastContactMs / 1000) : null;

  return {
    id: `${callsign}-${lastContact ?? 0}`,
    icao24,
    callsign,
    originCountry: item.departure?.airport?.trim() || item.airline?.name?.trim() || "Unknown",
    latitude: flightLatitude,
    longitude: flightLongitude,
    altitude,
    velocity,
    track: flightTrack,
    verticalRate,
    onGround,
    direction,
    lastContact,
  };
}

function toFlightStateFromOpenSky(row: NonNullable<OpenSkyResponse["states"]>[number]): FlightState | null {
  const icao24 = row[0]?.trim() ?? "";
  const callsign = row[1]?.trim() ?? "";
  const originCountry = row[2]?.trim() ?? "Unknown";
  const longitude = row[5];
  const latitude = row[6];
  const altitude = row[7];
  const onGround = row[8] ?? false;
  const velocity = row[9];
  const track = row[10];
  const verticalRate = row[11];
  const lastContact = row[4];

  if (!icao24 || !Number.isFinite(latitude) || !Number.isFinite(longitude) || onGround) {
    return null;
  }

  const flightLatitude = latitude as number;
  const flightLongitude = longitude as number;
  const flightTrack = Number.isFinite(track) ? track : null;
  const direction = classifyFlightDirection(flightLatitude, flightLongitude, flightTrack);

  return {
    id: callsign || icao24,
    icao24,
    callsign: callsign || "UNKN",
    originCountry,
    latitude: flightLatitude,
    longitude: flightLongitude,
    altitude: Number.isFinite(altitude) ? altitude : null,
    velocity: Number.isFinite(velocity) ? velocity : null,
    track: flightTrack,
    verticalRate: Number.isFinite(verticalRate) ? verticalRate : null,
    onGround,
    direction,
    lastContact: Number.isFinite(lastContact) ? lastContact : null,
  };
}

async function fetchFlightsFromAviationStack(): Promise<FlightState[]> {
  const apiKey = getAviationStackApiKey();
  const endpoints = [
    { dep_icao: "WSSS" },
    { arr_icao: "WSSS" },
    { dep_icao: "WSSL" },
    { arr_icao: "WSSL" },
  ] as const;

  const responses = await Promise.allSettled(
    endpoints.map(async (filter) => {
      const params = new URLSearchParams({
        access_key: apiKey,
        limit: "100",
        ...filter,
      });

      const response = await fetchWithTimeout(`${AVIATIONSTACK_BASE_URL}/flights?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Aviationstack request failed (${response.status})`);
      }

      const payload = (await response.json()) as AviationStackResponse;
      if (payload.error) {
        throw new Error(
          `Aviationstack error${payload.error.code ? ` ${payload.error.code}` : ""}: ${payload.error.info ?? payload.error.type ?? "unknown"}`,
        );
      }

      return payload.data ?? [];
    }),
  );

  const deduped = new globalThis.Map<string, FlightState>();
  for (const result of responses) {
    if (result.status !== "fulfilled") {
      continue;
    }

    for (const item of result.value) {
      const flight = toFlightStateFromAviationStack(item);
      if (!flight) continue;

      const existing = deduped.get(flight.icao24);
      const existingTs = existing?.lastContact ?? 0;
      const currentTs = flight.lastContact ?? 0;
      if (!existing || currentTs >= existingTs) {
        deduped.set(flight.icao24, flight);
      }
    }
  }

  return Array.from(deduped.values());
}

async function fetchFlightsFromOpenSky(): Promise<FlightState[]> {
  const params = new URLSearchParams({
    lamin: String(SG_BOUNDS.lamin),
    lomin: String(SG_BOUNDS.lomin),
    lamax: String(SG_BOUNDS.lamax),
    lomax: String(SG_BOUNDS.lomax),
  });

  const response = await fetchWithTimeout(`${OPENSKY_BASE_URL}/states/all?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`OpenSky request failed (${response.status})`);
  }

  const payload = (await response.json()) as OpenSkyResponse;
  const states = payload.states ?? [];

  return states
    .map((row) => toFlightStateFromOpenSky(row))
    .filter((flight): flight is FlightState => flight !== null);
}

export async function getFlights(): Promise<FlightState[]> {
  return cachedFetch("flights-sg", async () => {
    let flights: FlightState[] = [];

    try {
      flights = await fetchFlightsFromAviationStack();
    } catch {
      flights = [];
    }

    if (flights.length === 0) {
      try {
        flights = await fetchFlightsFromOpenSky();
      } catch {
        flights = [];
      }
    }

    if (flights.length > 0) {
      lastSuccessfulFlights = flights;
      lastSuccessfulFlightsAt = Date.now();
    } else if (lastSuccessfulFlights.length > 0) {
      const ageMs = Date.now() - lastSuccessfulFlightsAt;
      if (ageMs <= FLIGHTS_FALLBACK_MAX_AGE_MS) {
        flights = lastSuccessfulFlights;
      }
    }

    return flights
      .sort((a, b) => {
        const aSpeed = a.velocity ?? 0;
        const bSpeed = b.velocity ?? 0;
        return bSpeed - aSpeed;
      })
      .slice(0, 120);
  }, 15 * 1000);
}
