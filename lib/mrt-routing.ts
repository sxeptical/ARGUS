type GraphEdge = {
  to: string;
  weight: number;
};

type StationLineNode = {
  key: string;
  station: string;
  line: string;
};

export type MrtRouteSegment = {
  line: string;
  from: string;
  to: string;
  stops: number;
};

export type MrtRoutePlan = {
  start: string;
  end: string;
  stations: string[];
  segments: MrtRouteSegment[];
  transfers: number;
  estimatedMinutes: number;
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

function getTransferMinutes(station: string, lineCount: number): number {
  const override = MINUTES_PER_TRANSFER_OVERRIDE[station];
  if (override !== undefined) return override;
  return lineCount >= 3 ? MINUTES_PER_TRANSFER_THREE_PLUS_LINE : MINUTES_PER_TRANSFER_TWO_LINE;
}

const MRT_OPERATIONAL_LINE_STATIONS: Record<string, string[]> = {
  "North South Line": [
    "Jurong East",
    "Bukit Batok",
    "Bukit Gombak",
    "Choa Chu Kang",
    "Yew Tee",
    "Kranji",
    "Marsiling",
    "Woodlands",
    "Admiralty",
    "Sembawang",
    "Canberra",
    "Yishun",
    "Khatib",
    "Yio Chu Kang",
    "Ang Mo Kio",
    "Bishan",
    "Braddell",
    "Toa Payoh",
    "Novena",
    "Newton",
    "Orchard",
    "Somerset",
    "Dhoby Ghaut",
    "City Hall",
    "Raffles Place",
    "Marina Bay",
    "Marina South Pier",
  ],
  "East West Line": [
    "Tuas Link",
    "Tuas West Road",
    "Tuas Crescent",
    "Gul Circle",
    "Joo Koon",
    "Pioneer",
    "Boon Lay",
    "Lakeside",
    "Chinese Garden",
    "Jurong East",
    "Clementi",
    "Dover",
    "Buona Vista",
    "Commonwealth",
    "Queenstown",
    "Redhill",
    "Tiong Bahru",
    "Outram Park",
    "Tanjong Pagar",
    "Raffles Place",
    "City Hall",
    "Bugis",
    "Lavender",
    "Kallang",
    "Aljunied",
    "Paya Lebar",
    "Eunos",
    "Kembangan",
    "Bedok",
    "Tanah Merah",
    "Simei",
    "Tampines",
    "Pasir Ris",
  ],
  "Changi Airport Branch": ["Tanah Merah", "Expo", "Changi Airport"],
  "North East Line": [
    "HarbourFront",
    "Outram Park",
    "Chinatown",
    "Clarke Quay",
    "Dhoby Ghaut",
    "Little India",
    "Farrer Park",
    "Boon Keng",
    "Potong Pasir",
    "Woodleigh",
    "Serangoon",
    "Kovan",
    "Hougang",
    "Buangkok",
    "Sengkang",
    "Punggol",
    "Punggol Coast",
  ],
  "Circle Line": [
    "Dhoby Ghaut",
    "Bras Basah",
    "Esplanade",
    "Promenade",
    "Nicoll Highway",
    "Stadium",
    "Mountbatten",
    "Dakota",
    "Paya Lebar",
    "MacPherson",
    "Tai Seng",
    "Bartley",
    "Serangoon",
    "Lorong Chuan",
    "Bishan",
    "Marymount",
    "Caldecott",
    "Botanic Gardens",
    "Farrer Road",
    "Holland Village",
    "Buona Vista",
    "one-north",
    "Kent Ridge",
    "Haw Par Villa",
    "Pasir Panjang",
    "Labrador Park",
    "Telok Blangah",
    "HarbourFront",
  ],
  "Circle Line Extension": [
    "HarbourFront",
    "Keppel",
    "Cantonment",
    "Prince Edward Road",
    "Marina Bay",
  ],
  "Downtown Line": [
    "Bukit Panjang",
    "Cashew",
    "Hillview",
    "Beauty World",
    "King Albert Park",
    "Sixth Avenue",
    "Tan Kah Kee",
    "Botanic Gardens",
    "Stevens",
    "Newton",
    "Little India",
    "Rochor",
    "Bugis",
    "Promenade",
    "Bayfront",
    "Downtown",
    "Telok Ayer",
    "Chinatown",
    "Fort Canning",
    "Bencoolen",
    "Jalan Besar",
    "Bendemeer",
    "Geylang Bahru",
    "Mattar",
    "MacPherson",
    "Ubi",
    "Kaki Bukit",
    "Bedok North",
    "Bedok Reservoir",
    "Tampines West",
    "Tampines",
    "Tampines East",
    "Upper Changi",
    "Expo",
  ],
  "Thomson-East Coast Line": [
    "Woodlands North",
    "Woodlands",
    "Woodlands South",
    "Springleaf",
    "Lentor",
    "Mayflower",
    "Bright Hill",
    "Upper Thomson",
    "Caldecott",
    "Stevens",
    "Napier",
    "Orchard Boulevard",
    "Orchard",
    "Great World",
    "Havelock",
    "Outram Park",
    "Maxwell",
    "Shenton Way",
    "Marina Bay",
    "Gardens by the Bay",
    "Tanjong Rhu",
    "Katong Park",
    "Tanjong Katong",
    "Marine Parade",
    "Marine Terrace",
    "Siglap",
    "Bayshore",
    "Bedok South",
    "Sungei Bedok",
  ],
};

const stationLineNodes = new Map<string, StationLineNode>();
const stationToNodeKeys = new Map<string, string[]>();
const graph = new Map<string, GraphEdge[]>();

function addEdge(from: string, to: string, weight: number): void {
  const edges = graph.get(from) ?? [];
  edges.push({ to, weight });
  graph.set(from, edges);
}

for (const [line, stations] of Object.entries(MRT_OPERATIONAL_LINE_STATIONS)) {
  for (let index = 0; index < stations.length; index += 1) {
    const station = stations[index];
    const key = `${station}::${line}`;
    stationLineNodes.set(key, { key, station, line });
    stationToNodeKeys.set(station, [...(stationToNodeKeys.get(station) ?? []), key]);
  }
}

for (const [line, stations] of Object.entries(MRT_OPERATIONAL_LINE_STATIONS)) {
  for (let index = 0; index < stations.length - 1; index += 1) {
    const from = `${stations[index]}::${line}`;
    const to = `${stations[index + 1]}::${line}`;
    const weight = MINUTES_PER_STOP_BY_LINE[line] ?? DEFAULT_MINUTES_PER_STOP;
    addEdge(from, to, weight);
    addEdge(to, from, weight);
  }
}

for (const [station, nodeKeys] of stationToNodeKeys.entries()) {
  const transferWeight = getTransferMinutes(station, nodeKeys.length);
  for (let i = 0; i < nodeKeys.length; i += 1) {
    for (let j = i + 1; j < nodeKeys.length; j += 1) {
      const a = nodeKeys[i];
      const b = nodeKeys[j];
      addEdge(a, b, transferWeight);
      addEdge(b, a, transferWeight);
    }
  }
}

export const MRT_STATION_NAMES = Array.from(stationToNodeKeys.keys()).sort((a, b) =>
  a.localeCompare(b, "en-SG"),
);

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
  };
  const segments: MrtRouteSegment[] = [];
  const transferStations: string[] = [];

  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];

    if (previous.station === current.station && previous.line !== current.line) {
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
      };
      continue;
    }

    active = {
      ...active,
      to: current.station,
      stops: active.stops + 1,
    };
  }

  if (active.stops > 0) {
    segments.push(active);
  }

  return { segments, transfers: transferCount, transferStations };
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
  const queue: Array<{ key: string; distance: number }> = [];

  for (const key of startKeys) {
    distances.set(key, 0);
    previous.set(key, null);
    queue.push({ key, distance: 0 });
  }

  let bestEndKey: string | null = null;

  while (queue.length > 0) {
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
    const previousNode = pathNodes[index - 1];
    const currentNode = pathNodes[index];
    if (previousNode.station !== currentNode.station) {
      stations.push(currentNode.station);
    }
  }

  const { segments, transfers, transferStations } = makeRouteSegments(pathNodes);
  const travelMinutes = segments.reduce(
    (sum, seg) => sum + seg.stops * (MINUTES_PER_STOP_BY_LINE[seg.line] ?? DEFAULT_MINUTES_PER_STOP),
    0,
  );
  const transferMinutes = transferStations.reduce(
    (sum, station) => sum + getTransferMinutes(station, stationToNodeKeys.get(station)?.length ?? 0),
    0,
  );
  const estimatedMinutes = travelMinutes + transferMinutes + ENTRY_EXIT_BUFFER_MINUTES;

  return {
    start,
    end,
    stations,
    segments,
    transfers,
    estimatedMinutes,
  };
}
