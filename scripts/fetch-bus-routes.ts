#!/usr/bin/env bun
/**
 * Authoring/build-time data pipeline (not run in CI or `next build`).
 * Fetches the full LTA BusRoutes dataset and writes the compact snapshot the
 * app reads instead of walking ~54 LTA pages per Worker invocation — more
 * subrequests than a Workers Free isolate is allowed.
 *
 * Run automatically by `bun run deploy`; run manually to refresh the snapshot:
 *   bun run data:bus-routes
 *
 * Output shape (services → direction → [busStopCode, stopSequence][]):
 *   { "fetchedAt": "2026-11-10", "services": { "10": { "1": [["01012", 1]] } } }
 */
import { writeFile } from "node:fs/promises";
import { LtaBusRoutesResponseSchema } from "@/types/schemas";

const LTA_BASE_URL = "https://datamall2.mytransport.sg/ltaodataservice";
const PAGE_SIZE = 500;
const PAGE_CONCURRENCY = 4;
const OUT_FILE = "public/bus-routes.json";
/** Current dataset is ~27k rows; refuse to publish a truncated snapshot. */
const MIN_ROWS = 20_000;
const MIN_SERVICES = 300;
const MAX_ATTEMPTS = 3;

type StopEntry = [busStopCode: string, stopSequence: number];
type Snapshot = {
  fetchedAt: string;
  services: Record<string, Record<string, StopEntry[]>>;
};

const apiKey = process.env.LTA_API_KEY?.trim();
if (!apiKey || apiKey.toLowerCase().includes("your_lta_datamall_key")) {
  console.error("LTA_API_KEY is missing or a placeholder; set it in .env.local.");
  process.exit(1);
}

const fetchPage = async (skip: number) => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      const response = await fetch(
        `${LTA_BASE_URL}/BusRoutes?$skip=${skip}`,
        {
          headers: { AccountKey: apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(60_000),
        },
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return LtaBusRoutesResponseSchema.parse(await response.json()).value;
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(
          `BusRoutes $skip=${skip} failed after ${MAX_ATTEMPTS} attempts: ${error}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
};

const rows: Array<{
  ServiceNo: string;
  Direction: number | string;
  StopSequence: number | string;
  BusStopCode: string;
}> = [];

for (let skip = 0; ; skip += PAGE_SIZE * PAGE_CONCURRENCY) {
  const pages = await Promise.all(
    Array.from({ length: PAGE_CONCURRENCY }, (_, i) =>
      fetchPage(skip + i * PAGE_SIZE),
    ),
  );
  let reachedEnd = false;
  for (const page of pages) {
    rows.push(...page);
    if (page.length < PAGE_SIZE) {
      reachedEnd = true;
      break;
    }
  }
  if (reachedEnd) break;
}

if (rows.length < MIN_ROWS) {
  throw new Error(
    `BusRoutes returned only ${rows.length} rows (expected at least ${MIN_ROWS}); refusing to write a truncated snapshot`,
  );
}

const services = new Map<string, Map<number, StopEntry[]>>();
for (const row of rows) {
  const serviceNo = row.ServiceNo?.trim();
  const busStopCode = row.BusStopCode?.trim();
  const direction = Number(row.Direction);
  const stopSequence = Number(row.StopSequence);
  if (!serviceNo || !busStopCode) continue;
  if (!Number.isInteger(direction) || !Number.isInteger(stopSequence)) continue;

  let byDirection = services.get(serviceNo);
  if (!byDirection) {
    byDirection = new Map();
    services.set(serviceNo, byDirection);
  }
  let stops = byDirection.get(direction);
  if (!stops) {
    stops = [];
    byDirection.set(direction, stops);
  }
  stops.push([busStopCode, stopSequence]);
}

if (services.size < MIN_SERVICES) {
  throw new Error(
    `BusRoutes covered only ${services.size} services (expected at least ${MIN_SERVICES})`,
  );
}

const compareService = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true });

const snapshot: Snapshot = {
  fetchedAt: new Date().toISOString().slice(0, 10),
  services: {},
};
for (const serviceNo of [...services.keys()].sort(compareService)) {
  const byDirection = services.get(serviceNo)!;
  const directionEntries: Record<string, StopEntry[]> = {};
  for (const direction of [...byDirection.keys()].sort((a, b) => a - b)) {
    directionEntries[String(direction)] = byDirection
      .get(direction)!
      .sort((a, b) => a[1] - b[1]);
  }
  snapshot.services[serviceNo] = directionEntries;
}

await writeFile(OUT_FILE, `${JSON.stringify(snapshot)}\n`);
console.log(
  `Wrote ${OUT_FILE}: ${rows.length} rows, ${services.size} services, ${snapshot.fetchedAt}`,
);
