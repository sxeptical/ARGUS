import { MRT_OPERATIONAL_LINE_STATIONS } from "@/lib/mrt-network";
import {
  busierCrowdLevel,
  crowdOnLine,
  resolveStationCode,
} from "@/lib/train-crowds";
import type {
  CrowdLevel,
  StationCrowd,
  TrainCrowds,
  TrainServiceAlert,
} from "@/types";

type GraphEdge = {
  to: string;
  weight: number;
  kind: "ride" | "transfer";
};

type StationLineNode = {
  key: string;
  station: string;
  line: string;
};

export type MrtRouteMode = "fastest" | "less-crowded" | "fewest-transfers";

export const MRT_ROUTE_MODES: ReadonlyArray<MrtRouteMode> = [
  "fastest",
  "less-crowded",
  "fewest-transfers",
];

export type MrtRouteSegment = {
  line: string;
  from: string;
  to: string;
  stops: number;
  /** Stations ridden in order, `from` to `to`; draws loop routes correctly. */
  stations: string[];
  /** Set only when at least one ridden hop on this segment crosses a live disruption. */
  disrupted?: true;
};

export type MrtRouteDisruption = {
  /** Affected operational line names this route rides through. */
  lines: string[];
  /** Affected station names touched on those disrupted lines. */
  stations: string[];
};

export type MrtRouteCrowdSummary = {
  /** Peak platform crowd encountered across ridden stops; null without readings. */
  peak: CrowdLevel | null;
  /** Count of ridden station platforms reporting high crowd. */
  highCount: number;
  /** Count of ridden station platforms reporting moderate crowd. */
  moderateCount: number;
  /** Weighted crowd exposure score used for comparing routes. */
  score: number;
};

export type MrtRoutePlan = {
  start: string;
  end: string;
  stations: string[];
  segments: MrtRouteSegment[];
  transfers: number;
  estimatedMinutes: number;
  /** Mode used to compute this route. */
  mode: MrtRouteMode;
  /** Live disruption impact on this route (empty when clear). */
  disruption: MrtRouteDisruption;
  /** Live platform crowd summary along this route. */
  crowd: MrtRouteCrowdSummary;
  /** True when the route detoured around an active disruption on the normal path. */
  detouredForDisruption: boolean;
  /** Disrupted lines on the normal path that this detour avoided. */
  avoidedDisruptedLines: string[];
  /** Extra minutes vs the undisrupted baseline route of the same mode (0 if none). */
  extraMinutesVsNormal: number;
  /** True when avoiding disruptions was requested but no clean rail route exists. */
  disruptionUnavoidable: boolean;
};

export type PlanMrtRouteOptions = {
  mode?: MrtRouteMode;
  /** Avoid disrupted stretches whenever an alternative rail route exists. Defaults to true. */
  avoidDisruptions?: boolean;
  trainAlerts?: ReadonlyArray<TrainServiceAlert>;
  trainCrowds?: TrainCrowds;
};

export const MRT_ROUTE_DEFAULTS = {
  start: "",
  end: "",
  mode: "fastest" as MrtRouteMode,
  avoidDisruptions: true,
};

const MINUTES_PER_STOP_BY_LINE: Record<string, number> = {
  "North South Line": 2.5,
  "East West Line": 2.5,
  "Changi Airport Branch": 3,
  "North East Line": 3,
  "Circle Line": 2,
  "Circle Line Extension": 2,
  "Downtown Line": 1.5,
  "Thomson-East Coast Line": 2.5,
  // TEL Stage 5 extension (Bayshore → Bedok South → Sungei Bedok) — opens 26 Dec 2026, not yet operational
  "Thomson-East Coast Line Extension": 2.5,
  // LRT stations are close together; trains take ~1.5 min per hop.
  "Bukit Panjang LRT": 1.5,
  "Sengkang LRT East Loop": 1.5,
  "Sengkang LRT West Loop": 1.5,
  "Punggol LRT East Loop": 1.5,
  "Punggol LRT West Loop": 1.5,
};
const DEFAULT_MINUTES_PER_STOP = 2;

const MINUTES_PER_TRANSFER_OVERRIDE: Record<string, number> = {
  "Dhoby Ghaut": 6,
  "Outram Park": 6,
  "Marina Bay": 4,
};
const MINUTES_PER_TRANSFER_TWO_LINE = 3;
const MINUTES_PER_TRANSFER_THREE_PLUS_LINE = 5;
const ENTRY_EXIT_BUFFER_MINUTES = 2;

const CROWD_HOP_PENALTY: Record<CrowdLevel, number> = {
  low: 0,
  moderate: 1,
  high: 3.5,
};
const CROWD_BOARDING_PENALTY: Record<CrowdLevel, number> = {
  low: 0,
  moderate: 1.5,
  high: 4.5,
};
const CROWD_TRANSFER_PENALTY: Record<CrowdLevel, number> = {
  low: 0,
  moderate: 2,
  high: 6,
};
const FEWEST_TRANSFERS_PENALTY = 15;
const UNAVOIDABLE_DISRUPTION_PENALTY = 120;

const EMPTY_DISRUPTION: MrtRouteDisruption = { lines: [], stations: [] };
const EMPTY_CROWD: MrtRouteCrowdSummary = {
  peak: null,
  highCount: 0,
  moderateCount: 0,
  score: 0,
};

function getTransferMinutes(station: string, lineCount: number): number {
  const override = MINUTES_PER_TRANSFER_OVERRIDE[station];
  if (override !== undefined) return override;
  return lineCount >= 3
    ? MINUTES_PER_TRANSFER_THREE_PLUS_LINE
    : MINUTES_PER_TRANSFER_TWO_LINE;
}

/** Minimal binary heap for Dijkstra — O(log V) push/pop instead of sort-per-pop. */
type HeapEntry = { key: string; distance: number };

class MinHeap {
  private items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    this.items.push(entry);
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].distance <= this.items[i].distance) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  pop(): HeapEntry | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = i * 2 + 2;
        let smallest = i;
        if (
          left < this.items.length &&
          this.items[left].distance < this.items[smallest].distance
        ) {
          smallest = left;
        }
        if (
          right < this.items.length &&
          this.items[right].distance < this.items[smallest].distance
        ) {
          smallest = right;
        }
        if (smallest === i) break;
        [this.items[i], this.items[smallest]] = [
          this.items[smallest],
          this.items[i],
        ];
        i = smallest;
      }
    }
    return top;
  }
}

const stationLineNodes = new Map<string, StationLineNode>();
const stationToNodeKeys = new Map<string, string[]>();
const graph = new Map<string, GraphEdge[]>();

function addEdge(
  from: string,
  to: string,
  weight: number,
  kind: GraphEdge["kind"],
): void {
  const edges = graph.get(from) ?? [];
  edges.push({ to, weight, kind });
  graph.set(from, edges);
}

for (const [line, stations] of Object.entries(MRT_OPERATIONAL_LINE_STATIONS)) {
  for (let index = 0; index < stations.length; index += 1) {
    const station = stations[index];
    const key = `${station}::${line}`;
    // Loop lines list their interchange twice; it is still one node.
    if (stationLineNodes.has(key)) continue;
    stationLineNodes.set(key, { key, station, line });
    stationToNodeKeys.set(station, [
      ...(stationToNodeKeys.get(station) ?? []),
      key,
    ]);
  }
}

for (const [line, stations] of Object.entries(MRT_OPERATIONAL_LINE_STATIONS)) {
  for (let index = 0; index < stations.length - 1; index += 1) {
    const from = `${stations[index]}::${line}`;
    const to = `${stations[index + 1]}::${line}`;
    const weight = MINUTES_PER_STOP_BY_LINE[line] ?? DEFAULT_MINUTES_PER_STOP;
    addEdge(from, to, weight, "ride");
    addEdge(to, from, weight, "ride");
  }
}

for (const [station, nodeKeys] of stationToNodeKeys.entries()) {
  const transferWeight = getTransferMinutes(station, nodeKeys.length);
  for (let i = 0; i < nodeKeys.length; i += 1) {
    for (let j = i + 1; j < nodeKeys.length; j += 1) {
      const a = nodeKeys[i];
      const b = nodeKeys[j];
      addEdge(a, b, transferWeight, "transfer");
      addEdge(b, a, transferWeight, "transfer");
    }
  }
}

export const MRT_STATION_NAMES = Array.from(stationToNodeKeys.keys()).sort(
  (a, b) => a.localeCompare(b, "en-SG"),
);

export function isRouteableMrtStation(station: string): boolean {
  return stationToNodeKeys.has(station);
}

function makeRouteSegments(nodes: StationLineNode[]): {
  segments: MrtRouteSegment[];
  transfers: number;
  transferStations: string[];
} {
  if (nodes.length === 0) {
    return { segments: [], transfers: 0, transferStations: [] };
  }

  let transferCount = 0;
  let active: MrtRouteSegment = {
    line: nodes[0].line,
    from: nodes[0].station,
    to: nodes[0].station,
    stops: 0,
    stations: [nodes[0].station],
  };
  const segments: MrtRouteSegment[] = [];
  const transferStations: string[] = [];

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];

    if (
      previous.station === current.station &&
      previous.line !== current.line
    ) {
      transferCount += 1;
      transferStations.push(current.station);
      if (active.stops > 0) {
        segments.push(active);
      }
      active = {
        line: current.line,
        from: current.station,
        to: current.station,
        stops: 0,
        stations: [current.station],
      };
      continue;
    }

    if (active.line !== current.line) {
      if (active.stops > 0) {
        segments.push(active);
      }
      active = {
        line: current.line,
        from: previous.station,
        to: current.station,
        stops: 1,
        stations: [previous.station, current.station],
      };
      continue;
    }

    active = {
      ...active,
      to: current.station,
      stops: active.stops + 1,
      stations: [...active.stations, current.station],
    };
  }

  if (active.stops > 0) {
    segments.push(active);
  }

  return { segments, transfers: transferCount, transferStations };
}

const OPERATIONAL_LINE_NAMES = Object.keys(MRT_OPERATIONAL_LINE_STATIONS);

type DisruptionMask = {
  readonly lines: ReadonlySet<string>;
  readonly nodes: ReadonlySet<string>;
};

const EMPTY_DISRUPTION_MASK: DisruptionMask = {
  lines: new Set(),
  nodes: new Set(),
};

function expandOperationalLines(rawLine: string): string[] {
  const trimmed = rawLine.trim();
  if (!trimmed) return [];
  if (trimmed in MRT_OPERATIONAL_LINE_STATIONS) return [trimmed];
  const upper = trimmed.toUpperCase();
  if (upper === "SLRT") {
    return OPERATIONAL_LINE_NAMES.filter((name) =>
      name.startsWith("Sengkang LRT "),
    );
  }
  if (upper === "PLRT") {
    return OPERATIONAL_LINE_NAMES.filter((name) =>
      name.startsWith("Punggol LRT "),
    );
  }
  return OPERATIONAL_LINE_NAMES.filter((name) =>
    name.startsWith(`${trimmed} `),
  );
}

/**
 * Translate active LTA disruption alerts into a routing mask. Station-level
 * codes narrow the disruption to edges touching those stations on that line;
 * lines without station-level codes mark the whole line disrupted.
 */
function buildDisruptionMask(
  alerts: ReadonlyArray<TrainServiceAlert> | undefined,
): DisruptionMask {
  if (!alerts || alerts.length === 0) return EMPTY_DISRUPTION_MASK;
  const lines = new Set<string>();
  const nodes = new Set<string>();

  for (const alert of alerts) {
    if (alert.status !== "disrupted") continue;
    const linesCoveredByStations = new Set<string>();

    for (const code of alert.affectedStations) {
      const resolved = resolveStationCode(code);
      if (!resolved) continue;
      for (const line of resolved.lines) {
        const nodeKey = `${resolved.station}::${line}`;
        if (stationLineNodes.has(nodeKey)) {
          nodes.add(nodeKey);
          linesCoveredByStations.add(line);
        }
      }
    }

    for (const rawLine of alert.affectedLines) {
      for (const line of expandOperationalLines(rawLine)) {
        if (!linesCoveredByStations.has(line)) {
          lines.add(line);
        }
      }
    }
  }

  return lines.size === 0 && nodes.size === 0
    ? EMPTY_DISRUPTION_MASK
    : { lines, nodes };
}

function isRideDisrupted(
  fromKey: string,
  toKey: string,
  line: string,
  mask: DisruptionMask,
): boolean {
  return mask.lines.has(line) || mask.nodes.has(fromKey) || mask.nodes.has(toKey);
}

function annotateRouteDisruption(
  segments: MrtRouteSegment[],
  mask: DisruptionMask,
): { segments: MrtRouteSegment[]; disruption: MrtRouteDisruption } {
  if (mask.lines.size === 0 && mask.nodes.size === 0) {
    return { segments, disruption: EMPTY_DISRUPTION };
  }
  const affectedLines = new Set<string>();
  const affectedStations = new Set<string>();

  const annotated = segments.map((segment) => {
    let segmentDisrupted = false;
    for (let index = 0; index < segment.stations.length - 1; index += 1) {
      const fromStation = segment.stations[index];
      const toStation = segment.stations[index + 1];
      const fromKey = `${fromStation}::${segment.line}`;
      const toKey = `${toStation}::${segment.line}`;
      if (isRideDisrupted(fromKey, toKey, segment.line, mask)) {
        segmentDisrupted = true;
        affectedLines.add(segment.line);
        if (mask.lines.has(segment.line)) {
          affectedStations.add(fromStation);
          affectedStations.add(toStation);
        } else {
          if (mask.nodes.has(fromKey)) affectedStations.add(fromStation);
          if (mask.nodes.has(toKey)) affectedStations.add(toStation);
        }
      }
    }
    return segmentDisrupted ? { ...segment, disrupted: true as const } : segment;
  });

  return {
    segments: annotated,
    disruption:
      affectedLines.size === 0
        ? EMPTY_DISRUPTION
        : {
            lines: [...affectedLines],
            stations: [...affectedStations],
          },
  };
}

function summarizeRouteCrowd(
  segments: ReadonlyArray<MrtRouteSegment>,
  crowdsByStation: ReadonlyMap<string, StationCrowd>,
): MrtRouteCrowdSummary {
  if (segments.length === 0 || crowdsByStation.size === 0) return EMPTY_CROWD;
  let peak: CrowdLevel | null = null;
  let highCount = 0;
  let moderateCount = 0;

  for (const segment of segments) {
    for (const station of segment.stations) {
      const level = crowdOnLine(crowdsByStation.get(station), segment.line);
      if (!level) continue;
      peak = peak ? busierCrowdLevel(peak, level) : level;
      if (level === "high") highCount += 1;
      else if (level === "moderate") moderateCount += 1;
    }
  }

  return {
    peak,
    highCount,
    moderateCount,
    score: highCount * 3 + moderateCount,
  };
}

type DisruptionPolicy = "ignore" | "exclude" | "penalize";

function computeRoute(
  start: string,
  end: string,
  mode: MrtRouteMode,
  crowdsByStation: ReadonlyMap<string, StationCrowd>,
  mask: DisruptionMask,
  disruptionPolicy: DisruptionPolicy,
): Omit<
  MrtRoutePlan,
  | "detouredForDisruption"
  | "avoidedDisruptedLines"
  | "extraMinutesVsNormal"
  | "disruptionUnavoidable"
> | null {
  const startKeys = stationToNodeKeys.get(start) ?? [];
  const endKeys = new Set(stationToNodeKeys.get(end) ?? []);
  if (startKeys.length === 0 || endKeys.size === 0) return null;

  const distances = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const queue = new MinHeap();

  for (const key of startKeys) {
    const startNode = stationLineNodes.get(key);
    let initialCost = 0;
    if (mode === "less-crowded" && startNode) {
      const level = crowdOnLine(
        crowdsByStation.get(startNode.station),
        startNode.line,
      );
      if (level) initialCost = CROWD_BOARDING_PENALTY[level];
    }
    distances.set(key, initialCost);
    previous.set(key, null);
    queue.push({ key, distance: initialCost });
  }

  let bestEndKey: string | null = null;

  while (queue.size > 0) {
    const current = queue.pop();
    if (!current) break;

    const bestDistance = distances.get(current.key);
    if (bestDistance === undefined || current.distance > bestDistance) continue;

    if (endKeys.has(current.key)) {
      bestEndKey = current.key;
      break;
    }

    const fromNode = stationLineNodes.get(current.key);
    for (const edge of graph.get(current.key) ?? []) {
      const toNode = stationLineNodes.get(edge.to);
      if (!fromNode || !toNode) continue;

      let stepCost = edge.weight;
      if (edge.kind === "ride") {
        const disrupted = isRideDisrupted(
          current.key,
          edge.to,
          fromNode.line,
          mask,
        );
        if (disrupted && disruptionPolicy === "exclude") continue;
        if (disrupted && disruptionPolicy === "penalize") {
          stepCost += UNAVOIDABLE_DISRUPTION_PENALTY;
        }
        if (mode === "less-crowded") {
          const level = crowdOnLine(
            crowdsByStation.get(toNode.station),
            toNode.line,
          );
          if (level) stepCost += CROWD_HOP_PENALTY[level];
        }
      } else {
        if (mode === "fewest-transfers") {
          stepCost += FEWEST_TRANSFERS_PENALTY;
        } else if (mode === "less-crowded") {
          const level = crowdOnLine(
            crowdsByStation.get(toNode.station),
            toNode.line,
          );
          if (level) stepCost += CROWD_TRANSFER_PENALTY[level];
        }
      }

      const nextDistance = current.distance + stepCost;
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
    const previousNode = pathNodes[index - 1];
    const currentNode = pathNodes[index];
    if (previousNode.station !== currentNode.station) {
      stations.push(currentNode.station);
    }
  }

  const {
    segments: rawSegments,
    transfers,
    transferStations,
  } = makeRouteSegments(pathNodes);
  const { segments, disruption } = annotateRouteDisruption(rawSegments, mask);
  const crowd = summarizeRouteCrowd(segments, crowdsByStation);

  const travelMinutes = segments.reduce(
    (sum, seg) =>
      sum +
      seg.stops *
        (MINUTES_PER_STOP_BY_LINE[seg.line] ?? DEFAULT_MINUTES_PER_STOP),
    0,
  );
  const transferMinutes = transferStations.reduce(
    (sum, station) =>
      sum +
      getTransferMinutes(station, stationToNodeKeys.get(station)?.length ?? 0),
    0,
  );
  const estimatedMinutes =
    travelMinutes + transferMinutes + ENTRY_EXIT_BUFFER_MINUTES;

  return {
    start,
    end,
    stations,
    segments,
    transfers,
    estimatedMinutes,
    mode,
    disruption,
    crowd,
  };
}

/** True when `candidate` takes a different path and meaningfully lowers crowd exposure. */
export function isQuieterRoute(
  candidate: MrtRoutePlan | null,
  baseline: MrtRoutePlan | null,
): boolean {
  if (!candidate || !baseline) return false;
  if (candidate.crowd.peak === null || baseline.crowd.peak === null) return false;
  const samePath =
    candidate.segments.length === baseline.segments.length &&
    candidate.segments.every(
      (seg, index) =>
        seg.line === baseline.segments[index].line &&
        seg.from === baseline.segments[index].from &&
        seg.to === baseline.segments[index].to,
    );
  if (samePath) return false;
  return (
    candidate.crowd.highCount < baseline.crowd.highCount ||
    (candidate.crowd.highCount === baseline.crowd.highCount &&
      candidate.crowd.score < baseline.crowd.score)
  );
}

export function planMrtRoute(
  start: string,
  end: string,
  options?: PlanMrtRouteOptions,
): MrtRoutePlan | null {
  if (!stationToNodeKeys.has(start) || !stationToNodeKeys.has(end)) {
    return null;
  }

  const mode = options?.mode ?? MRT_ROUTE_DEFAULTS.mode;
  const avoidDisruptions =
    options?.avoidDisruptions ?? MRT_ROUTE_DEFAULTS.avoidDisruptions;

  if (start === end) {
    return {
      start,
      end,
      stations: [start],
      segments: [],
      transfers: 0,
      estimatedMinutes: 0,
      mode,
      disruption: EMPTY_DISRUPTION,
      crowd: EMPTY_CROWD,
      detouredForDisruption: false,
      avoidedDisruptedLines: [],
      extraMinutesVsNormal: 0,
      disruptionUnavoidable: false,
    };
  }

  const mask = buildDisruptionMask(options?.trainAlerts);
  const hasDisruptions = mask.lines.size > 0 || mask.nodes.size > 0;
  const crowdsByStation = new Map(
    (options?.trainCrowds?.stations ?? []).map((crowd) => [
      crowd.station,
      crowd,
    ]),
  );

  if (!hasDisruptions || !avoidDisruptions) {
    const plan = computeRoute(
      start,
      end,
      mode,
      crowdsByStation,
      mask,
      "ignore",
    );
    if (!plan) return null;
    return {
      ...plan,
      detouredForDisruption: false,
      avoidedDisruptedLines: [],
      extraMinutesVsNormal: 0,
      disruptionUnavoidable: false,
    };
  }

  const normal = computeRoute(
    start,
    end,
    mode,
    crowdsByStation,
    mask,
    "ignore",
  );
  // If the normal path is already clear, no need to run a second search.
  if (normal && normal.disruption.lines.length === 0) {
    return {
      ...normal,
      detouredForDisruption: false,
      avoidedDisruptedLines: [],
      extraMinutesVsNormal: 0,
      disruptionUnavoidable: false,
    };
  }

  const clean = computeRoute(
    start,
    end,
    mode,
    crowdsByStation,
    mask,
    "exclude",
  );
  if (clean) {
    const extraMinutesVsNormal = normal
      ? Math.max(0, clean.estimatedMinutes - normal.estimatedMinutes)
      : 0;
    return {
      ...clean,
      detouredForDisruption: true,
      avoidedDisruptedLines: normal?.disruption.lines ?? [],
      extraMinutesVsNormal,
      disruptionUnavoidable: false,
    };
  }

  // No rail route completely avoids the disruption; minimize time on disrupted tracks.
  const fallback =
    computeRoute(start, end, mode, crowdsByStation, mask, "penalize") ?? normal;
  if (!fallback) return null;
  return {
    ...fallback,
    detouredForDisruption: false,
    avoidedDisruptedLines: [],
    extraMinutesVsNormal: 0,
    disruptionUnavoidable: fallback.disruption.lines.length > 0,
  };
}
