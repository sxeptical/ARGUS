import {
  MRT_LINE_BY_NAME,
  MRT_OPERATIONAL_LINES,
} from "@/lib/mrt-network";

type GraphEdge = {
  readonly to: string;
  readonly weight: number;
};

type StationLineNode = {
  readonly key: string;
  readonly station: string;
  readonly line: string;
};

export type MrtRouteSegment = {
  readonly line: string;
  readonly from: string;
  readonly to: string;
  readonly stops: number;
};

export type MrtRoutePlan = {
  readonly start: string;
  readonly end: string;
  readonly stations: ReadonlyArray<string>;
  readonly segments: ReadonlyArray<MrtRouteSegment>;
  readonly transfers: number;
  readonly estimatedMinutes: number;
};

export const MRT_ROUTE_DEFAULTS: Readonly<{ start: string; end: string }> = {
  start: "",
  end: "",
};

const MINUTES_PER_TRANSFER_OVERRIDE: Readonly<Record<string, number>> = {
  "Dhoby Ghaut": 6,
  "Outram Park": 6,
  "Marina Bay": 4,
};
const MINUTES_PER_TRANSFER_TWO_LINE = 3;
const MINUTES_PER_TRANSFER_THREE_PLUS_LINE = 5;
const ENTRY_EXIT_BUFFER_MINUTES = 2;

function getTransferMinutes(station: string, lineCount: number): number {
  const override = MINUTES_PER_TRANSFER_OVERRIDE[station];
  if (override !== undefined) return override;
  // Larger interchanges are modelled as longer walks, even when a journey
  // transfers between only two of the lines serving that station.
  return lineCount >= 3
    ? MINUTES_PER_TRANSFER_THREE_PLUS_LINE
    : MINUTES_PER_TRANSFER_TWO_LINE;
}

function nodeKey(station: string, line: string): string {
  return `${station}::${line}`;
}

function buildNetworkGraph() {
  const stationLineNodes = new Map<string, StationLineNode>();
  const stationToNodeKeys = new Map<string, string[]>();
  const graph = new Map<string, GraphEdge[]>();

  const addEdge = (from: string, to: string, weight: number): void => {
    const edges = graph.get(from) ?? [];
    edges.push({ to, weight });
    graph.set(from, edges);
  };

  for (const line of MRT_OPERATIONAL_LINES) {
    for (const { name: station } of line.stations) {
      const key = nodeKey(station, line.name);
      stationLineNodes.set(key, { key, station, line: line.name });
      stationToNodeKeys.set(station, [
        ...(stationToNodeKeys.get(station) ?? []),
        key,
      ]);
    }
  }

  for (const line of MRT_OPERATIONAL_LINES) {
    for (let index = 0; index < line.stations.length - 1; index += 1) {
      const from = nodeKey(line.stations[index].name, line.name);
      const to = nodeKey(line.stations[index + 1].name, line.name);
      addEdge(from, to, line.minutesPerStop);
      addEdge(to, from, line.minutesPerStop);
    }
  }

  for (const [station, keys] of stationToNodeKeys) {
    const transferWeight = getTransferMinutes(station, keys.length);
    for (let i = 0; i < keys.length; i += 1) {
      for (let j = i + 1; j < keys.length; j += 1) {
        addEdge(keys[i], keys[j], transferWeight);
        addEdge(keys[j], keys[i], transferWeight);
      }
    }
  }

  return { stationLineNodes, stationToNodeKeys, graph };
}

const { stationLineNodes, stationToNodeKeys, graph } = buildNetworkGraph();

export const MRT_STATION_NAMES = [...stationToNodeKeys.keys()].sort((a, b) =>
  a.localeCompare(b, "en-SG"),
);

export function isRouteableMrtStation(station: string): boolean {
  return stationToNodeKeys.has(station);
}

function makeRouteSegments(nodes: ReadonlyArray<StationLineNode>): {
  readonly segments: MrtRouteSegment[];
  readonly transfers: number;
  readonly transferStations: string[];
} {
  if (nodes.length === 0) {
    return { segments: [], transfers: 0, transferStations: [] };
  }

  let transfers = 0;
  let active: MrtRouteSegment = {
    line: nodes[0].line,
    from: nodes[0].station,
    to: nodes[0].station,
    stops: 0,
  };
  const segments: MrtRouteSegment[] = [];
  const transferStations: string[] = [];

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];

    if (previous.station === current.station && previous.line !== current.line) {
      transfers += 1;
      transferStations.push(current.station);
      if (active.stops > 0) segments.push(active);
      active = {
        line: current.line,
        from: current.station,
        to: current.station,
        stops: 0,
      };
      continue;
    }

    if (active.line !== current.line) {
      if (active.stops > 0) segments.push(active);
      active = {
        line: current.line,
        from: previous.station,
        to: current.station,
        stops: 1,
      };
      continue;
    }

    active = {
      ...active,
      to: current.station,
      stops: active.stops + 1,
    };
  }

  if (active.stops > 0) segments.push(active);
  return { segments, transfers, transferStations };
}

export function planMrtRoute(start: string, end: string): MrtRoutePlan | null {
  if (!stationToNodeKeys.has(start) || !stationToNodeKeys.has(end)) {
    return null;
  }
  if (start === end) {
    return {
      start,
      end,
      stations: [start],
      segments: [],
      transfers: 0,
      estimatedMinutes: 0,
    };
  }

  const startKeys = stationToNodeKeys.get(start) ?? [];
  const endKeys = new Set(stationToNodeKeys.get(end) ?? []);
  if (startKeys.length === 0 || endKeys.size === 0) return null;

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const queue: Array<{ readonly key: string; readonly distance: number }> = [];

  for (const key of startKeys) {
    distances.set(key, 0);
    previous.set(key, null);
    queue.push({ key, distance: 0 });
  }

  let bestEndKey: string | null = null;
  while (queue.length > 0) {
    // The network is small (~200 nodes); an array keeps this implementation
    // direct. Replace with a heap only if the topology grows materially.
    queue.sort((a, b) => a.distance - b.distance);
    const current = queue.shift();
    if (!current) break;

    const bestDistance = distances.get(current.key);
    if (bestDistance === undefined || current.distance > bestDistance) continue;
    if (endKeys.has(current.key)) {
      bestEndKey = current.key;
      break;
    }

    for (const edge of graph.get(current.key) ?? []) {
      const nextDistance = current.distance + edge.weight;
      const knownDistance = distances.get(edge.to);
      if (knownDistance === undefined || nextDistance < knownDistance) {
        distances.set(edge.to, nextDistance);
        previous.set(edge.to, current.key);
        queue.push({ key: edge.to, distance: nextDistance });
      }
    }
  }
  if (!bestEndKey) return null;

  const pathKeys: string[] = [];
  let cursor: string | null = bestEndKey;
  while (cursor) {
    pathKeys.push(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  pathKeys.reverse();

  const pathNodes = pathKeys
    .map((key) => stationLineNodes.get(key))
    .filter((node): node is StationLineNode => node !== undefined);
  if (pathNodes.length === 0) return null;

  const stations: string[] = [pathNodes[0].station];
  for (let index = 1; index < pathNodes.length; index += 1) {
    if (pathNodes[index - 1].station !== pathNodes[index].station) {
      stations.push(pathNodes[index].station);
    }
  }

  const { segments, transfers, transferStations } = makeRouteSegments(pathNodes);
  const travelMinutes = segments.reduce(
    (sum, segment) =>
      sum +
      segment.stops *
        (MRT_LINE_BY_NAME.get(segment.line)?.minutesPerStop ?? 2),
    0,
  );
  const transferMinutes = transferStations.reduce(
    (sum, station) =>
      sum +
      getTransferMinutes(station, stationToNodeKeys.get(station)?.length ?? 0),
    0,
  );

  return {
    start,
    end,
    stations,
    segments,
    transfers,
    estimatedMinutes:
      travelMinutes + transferMinutes + ENTRY_EXIT_BUFFER_MINUTES,
  };
}
