/**
 * LTA platform crowd density (PCDRealTime): station codes to the station
 * names the map uses, and the per-line readings merged per station.
 */
import type { CrowdLevel, StationCrowd, StationLineCrowd } from "@/types";

/** PCDRealTime `TrainLine` values, with the display name for each. */
export const PCD_TRAIN_LINES: Record<string, string> = {
  NSL: "North South Line",
  EWL: "East West Line",
  CGL: "Changi Airport Branch",
  NEL: "North East Line",
  CCL: "Circle Line",
  CEL: "Circle Line Extension",
  DTL: "Downtown Line",
  TEL: "Thomson-East Coast Line",
  BPL: "Bukit Panjang LRT",
  SLRT: "Sengkang LRT",
  PLRT: "Punggol LRT",
};

// Index = code number; null marks numbers reserved for unopened stations.
const NUMBERED: Record<string, ReadonlyArray<string | null>> = {
  NS: [null, "Jurong East", "Bukit Batok", "Bukit Gombak", "Choa Chu Kang", "Yew Tee", null, "Kranji", "Marsiling", "Woodlands", "Admiralty", "Sembawang", "Canberra", "Yishun", "Khatib", "Yio Chu Kang", "Ang Mo Kio", "Bishan", "Braddell", "Toa Payoh", "Novena", "Newton", "Orchard", "Somerset", "Dhoby Ghaut", "City Hall", "Raffles Place", "Marina Bay", "Marina South Pier"],
  EW: [null, "Pasir Ris", "Tampines", "Simei", "Tanah Merah", "Bedok", "Kembangan", "Eunos", "Paya Lebar", "Aljunied", "Kallang", "Lavender", "Bugis", "City Hall", "Raffles Place", "Tanjong Pagar", "Outram Park", "Tiong Bahru", "Redhill", "Queenstown", "Commonwealth", "Buona Vista", "Dover", "Clementi", "Jurong East", "Chinese Garden", "Lakeside", "Boon Lay", "Pioneer", "Joo Koon", "Gul Circle", "Tuas Crescent", "Tuas West Road", "Tuas Link"],
  CG: ["Tanah Merah", "Expo", "Changi Airport"],
  NE: [null, "HarbourFront", null, "Outram Park", "Chinatown", "Clarke Quay", "Dhoby Ghaut", "Little India", "Farrer Park", "Boon Keng", "Potong Pasir", "Woodleigh", "Serangoon", "Kovan", "Hougang", "Buangkok", "Sengkang", "Punggol", "Punggol Coast"],
  CC: [null, "Dhoby Ghaut", "Bras Basah", "Esplanade", "Promenade", "Nicoll Highway", "Stadium", "Mountbatten", "Dakota", "Paya Lebar", "MacPherson", "Tai Seng", "Bartley", "Serangoon", "Lorong Chuan", "Bishan", "Marymount", "Caldecott", null, "Botanic Gardens", "Farrer Road", "Holland Village", "Buona Vista", "one-north", "Kent Ridge", "Haw Par Villa", "Pasir Panjang", "Labrador Park", "Telok Blangah", "HarbourFront", "Keppel", "Cantonment", "Prince Edward Road"],
  CE: [null, "Bayfront", "Marina Bay"],
  DT: [null, "Bukit Panjang", "Cashew", "Hillview", "Hume", "Beauty World", "King Albert Park", "Sixth Avenue", "Tan Kah Kee", "Botanic Gardens", "Stevens", "Newton", "Little India", "Rochor", "Bugis", "Promenade", "Bayfront", "Downtown", "Telok Ayer", "Chinatown", "Fort Canning", "Bencoolen", "Jalan Besar", "Bendemeer", "Geylang Bahru", "Mattar", "MacPherson", "Ubi", "Kaki Bukit", "Bedok North", "Bedok Reservoir", "Tampines West", "Tampines", "Tampines East", "Upper Changi", "Expo"],
  TE: [null, "Woodlands North", "Woodlands", "Woodlands South", "Springleaf", "Lentor", "Mayflower", "Bright Hill", "Upper Thomson", "Caldecott", null, "Stevens", "Napier", "Orchard Boulevard", "Orchard", "Great World", "Havelock", "Outram Park", "Maxwell", "Shenton Way", "Marina Bay", null, "Gardens by the Bay", "Tanjong Rhu", "Katong Park", "Tanjong Katong", "Marine Parade", "Marine Terrace", "Siglap", "Bayshore"],
  BP: [null, "Choa Chu Kang", "South View", "Keat Hong", "Teck Whye", "Phoenix", "Bukit Panjang", "Petir", "Pending", "Bangkit", "Fajar", "Segar", "Jelapang", "Senja"],
  SE: ["Sengkang", "Compassvale", "Rumbia", "Bakau", "Kangkar", "Ranggung"],
  SW: ["Sengkang", "Cheng Lim", "Farmway", "Kupang", "Thanggam", "Fernvale", "Layar", "Tongkang", "Renjong"],
  PE: ["Punggol", "Cove", "Meridian", "Coral Edge", "Riviera", "Kadaloor", "Oasis", "Damai"],
  PW: ["Punggol", "Sam Kee", "Teck Lee", "Punggol Point", "Samudera", "Nibong", "Sumang", "Soo Teck"],
};

/** LRT town-centre codes, which carry no number. */
const LETTERED: Record<string, string> = { STC: "Sengkang", PTC: "Punggol" };

/** Station name for an LTA code such as "EW13" or "STC"; null if unknown. */
export function stationNameForCode(code: string): string | null {
  const trimmed = code.trim().toUpperCase();
  if (LETTERED[trimmed]) return LETTERED[trimmed];
  const match = /^([A-Z]{2})(\d{1,2})$/.exec(trimmed);
  if (!match) return null;
  return NUMBERED[match[1]]?.[Number(match[2])] ?? null;
}

const LEVEL_BY_CODE: Record<string, CrowdLevel> = { l: "low", m: "moderate", h: "high" };
const LEVEL_RANK: Record<CrowdLevel, number> = { low: 0, moderate: 1, high: 2 };

export const parseCrowdLevel = (value: string | null | undefined): CrowdLevel | null =>
  LEVEL_BY_CODE[value?.trim().toLowerCase() ?? ""] ?? null;

export const busierCrowdLevel = (a: CrowdLevel, b: CrowdLevel): CrowdLevel =>
  LEVEL_RANK[b] > LEVEL_RANK[a] ? b : a;

export const CROWD_LEVEL_LABEL: Record<CrowdLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
};

export type PlatformCrowdRow = {
  readonly line: string;
  readonly code: string;
  readonly level: CrowdLevel;
};

/**
 * One entry per station, busiest first then by name. Interchanges merge their
 * codes; a code that has no known station name keeps the code as its name.
 */
export function mergeStationCrowds(rows: ReadonlyArray<PlatformCrowdRow>): StationCrowd[] {
  const byStation = new Map<string, StationCrowd>();
  for (const row of rows) {
    const station = stationNameForCode(row.code) ?? row.code;
    const lineCrowd: StationLineCrowd = { code: row.code, line: row.line, level: row.level };
    const existing = byStation.get(station);
    if (!existing) {
      byStation.set(station, { station, level: row.level, lines: [lineCrowd] });
      continue;
    }
    // LTA lists a shared LRT code like STC under both loops of one feed.
    if (existing.lines.some((line) => line.code === row.code)) continue;
    existing.lines.push(lineCrowd);
    existing.level = busierCrowdLevel(existing.level, row.level);
  }
  return [...byStation.values()].sort(
    (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.station.localeCompare(b.station, "en-SG"),
  );
}

export const CROWD_LEVEL_TONE: Record<CrowdLevel, "success" | "warning" | "danger"> = {
  low: "success",
  moderate: "warning",
  high: "danger",
};

/**
 * A station's crowd on one line. Route lines can be finer than LTA's feeds
 * ("Sengkang LRT East Loop" vs "Sengkang LRT"); with no line match, the
 * station's overall level stands in.
 */
export function crowdOnLine(crowd: StationCrowd | undefined, line: string): CrowdLevel | null {
  if (!crowd) return null;
  const match = crowd.lines.find((entry) => entry.line === line || line.startsWith(`${entry.line} `));
  return match?.level ?? crowd.level;
}

/** The busiest of `stations` on `line`, first one wins ties; null without readings. */
export function busiestOnLine(
  stations: ReadonlyArray<string>,
  line: string,
  crowds: ReadonlyMap<string, StationCrowd>,
): { station: string; level: CrowdLevel } | null {
  let busiest: { station: string; level: CrowdLevel } | null = null;
  for (const station of stations) {
    const level = crowdOnLine(crowds.get(station), line);
    if (level && (!busiest || LEVEL_RANK[level] > LEVEL_RANK[busiest.level])) busiest = { station, level };
  }
  return busiest;
}
