/**
 * Human-readable labels, expressway/checkpoint groupings, and live incident
 * pairing for LTA DataMall traffic cameras.
 */
import { distanceM } from "@/lib/geo-filter";
import type { TrafficCamera, TrafficIncident } from "@/types";

export type CameraGroup =
  | "checkpoints"
  | "sentosa"
  | "ecp"
  | "cte"
  | "pie"
  | "aye"
  | "bke"
  | "tpe"
  | "sle"
  | "kje"
  | "mce"
  | "kpe"
  | "other";

export const CAMERA_GROUP_ORDER: ReadonlyArray<CameraGroup> = [
  "checkpoints",
  "sentosa",
  "ecp",
  "cte",
  "pie",
  "aye",
  "bke",
  "tpe",
  "sle",
  "kje",
  "mce",
  "kpe",
  "other",
];

export const CAMERA_GROUP_LABEL: Record<CameraGroup, string> = {
  checkpoints: "Checkpoints",
  sentosa: "Sentosa",
  ecp: "ECP",
  cte: "CTE",
  pie: "PIE",
  aye: "AYE",
  bke: "BKE",
  tpe: "TPE",
  sle: "SLE",
  kje: "KJE",
  mce: "MCE",
  kpe: "KPE",
  other: "Other",
};

type CameraCatalogEntry = {
  readonly location: string;
  readonly group: CameraGroup;
};

/**
 * Known LTA DataMall camera IDs: covers all active checkpoint and Sentosa
 * cameras plus major expressway IDs in case LTA restores expressway feeds.
 */
const CAMERA_CATALOG: Record<string, CameraCatalogEntry> = {
  // Checkpoints (Woodlands / Tuas)
  "2701": { location: "Woodlands Causeway (Towards Johor)", group: "checkpoints" },
  "2702": { location: "Woodlands Checkpoint (Towards BKE)", group: "checkpoints" },
  "2704": { location: "BKE Woodlands Flyover (Towards Checkpoint)", group: "checkpoints" },
  "4703": { location: "Tuas Second Link", group: "checkpoints" },
  "4712": { location: "AYE After Tuas West Road", group: "checkpoints" },
  "4713": { location: "Tuas Checkpoint", group: "checkpoints" },

  // Sentosa Gateway
  "4798": { location: "Sentosa Gateway (Towards Sentosa)", group: "sentosa" },
  "4799": { location: "Sentosa Gateway (Towards Telok Blangah)", group: "sentosa" },

  // KPE / ECP
  "1001": { location: "ECP Benjamin Sheares Bridge", group: "ecp" },
  "1002": { location: "KPE Defu Flyover", group: "kpe" },
  "1003": { location: "KPE Kallang Bahru", group: "kpe" },
  "1004": { location: "KPE Kallang Way Flyover", group: "kpe" },
  "1005": { location: "KPE Tampines Rd", group: "kpe" },
  "1006": { location: "KPE Upper Paya Lebar", group: "kpe" },
  "3702": { location: "ECP Fort Road", group: "ecp" },
  "3704": { location: "ECP Marine Parade Flyover", group: "ecp" },
  "3705": { location: "ECP Changi Coast Rd", group: "ecp" },
  "3793": { location: "ECP Laguna Flyover", group: "ecp" },
  "3795": { location: "ECP Marine Vista", group: "ecp" },
  "3796": { location: "ECP Tanjong Katong Flyover", group: "ecp" },
  "3797": { location: "ECP Tanjong Rhu", group: "ecp" },
  "3798": { location: "ECP Benjamin Sheares Bridge (City)", group: "ecp" },

  // MCE
  "1501": { location: "MCE Maxwell Rd", group: "mce" },
  "1502": { location: "MCE Marina Blvd", group: "mce" },
  "1503": { location: "MCE Marina Coastal Tunnel", group: "mce" },
  "1504": { location: "MCE Fort Rd", group: "mce" },
  "1505": { location: "MCE Marina East", group: "mce" },

  // CTE
  "1701": { location: "CTE Moulmein Flyover", group: "cte" },
  "1702": { location: "CTE Braddell Flyover", group: "cte" },
  "1703": { location: "CTE St George Rd", group: "cte" },
  "1704": { location: "CTE Chin Swee Rd", group: "cte" },
  "1705": { location: "CTE Ang Mo Kio Ave 5", group: "cte" },
  "1706": { location: "CTE Yio Chu Kang Flyover", group: "cte" },
  "1707": { location: "CTE Bukit Merah Flyover", group: "cte" },
  "1709": { location: "CTE Bukit Timah Rd", group: "cte" },
  "1711": { location: "CTE Ang Mo Kio Ave 1", group: "cte" },

  // BKE
  "2703": { location: "BKE Chantek Flyover", group: "bke" },
  "2705": { location: "BKE Dairy Farm Flyover", group: "bke" },
  "2706": { location: "BKE Mandai Rd", group: "bke" },
  "2707": { location: "BKE Woodlands South Flyover", group: "bke" },
  "2708": { location: "BKE KJE Exit", group: "bke" },

  // AYE
  "4701": { location: "AYE Alexander Rd", group: "aye" },
  "4702": { location: "AYE Keppel Viaduct", group: "aye" },
  "4704": { location: "AYE Lower Delta Rd", group: "aye" },
  "4705": { location: "AYE Yuan Ching Rd", group: "aye" },
  "4706": { location: "AYE Near NUS", group: "aye" },
  "4707": { location: "AYE Jurong Town Hall", group: "aye" },
  "4708": { location: "AYE Clementi Ave 6", group: "aye" },
  "4709": { location: "AYE Clementi Rd", group: "aye" },
  "4710": { location: "AYE Pandan Gardens", group: "aye" },
  "4714": { location: "AYE Near West Coast Walk", group: "aye" },
  "4716": { location: "AYE Benoi Rd", group: "aye" },

  // PIE
  "5794": { location: "PIE Bedok North", group: "pie" },
  "5795": { location: "PIE Eunos Flyover", group: "pie" },
  "5797": { location: "PIE Paya Lebar Flyover", group: "pie" },
  "5798": { location: "PIE Kallang Way", group: "pie" },
  "5799": { location: "PIE Woodsville Flyover", group: "pie" },
  "6701": { location: "PIE Kim Keat Link", group: "pie" },
  "6703": { location: "PIE Thomson Flyover", group: "pie" },
  "6704": { location: "PIE Mount Pleasant", group: "pie" },
  "6705": { location: "PIE Adam Rd", group: "pie" },
  "6706": { location: "PIE BKE", group: "pie" },
  "6708": { location: "PIE Nanyang Flyover", group: "pie" },
  "6710": { location: "PIE Anak Bukit Flyover", group: "pie" },
  "6711": { location: "PIE Changi", group: "pie" },
  "6712": { location: "PIE Clementi Ave 6", group: "pie" },
  "6713": { location: "PIE Simei Ave", group: "pie" },
  "6714": { location: "PIE Exit 35 (KJE)", group: "pie" },
  "6715": { location: "PIE Hong Kah Flyover", group: "pie" },
  "6716": { location: "PIE Tuas Flyover", group: "pie" },

  // TPE
  "7791": { location: "TPE Upper Changi Flyover", group: "tpe" },
  "7793": { location: "TPE Tampines Ave 10", group: "tpe" },
  "7794": { location: "TPE KPE Exit", group: "tpe" },
  "7795": { location: "TPE Tampines Flyover", group: "tpe" },
  "7796": { location: "TPE Punggol Flyover", group: "tpe" },
  "7797": { location: "TPE Seletar West Link", group: "tpe" },
  "7798": { location: "TPE SLE Flyover", group: "tpe" },

  // KJE
  "8701": { location: "KJE Choa Chu Kang West Flyover", group: "kje" },
  "8702": { location: "KJE BKE Exit", group: "kje" },
  "8704": { location: "KJE Choa Chu Kang Dr", group: "kje" },
  "8706": { location: "KJE Tengah Flyover", group: "kje" },

  // SLE
  "9701": { location: "SLE Lentor Flyover", group: "sle" },
  "9702": { location: "SLE Upper Thomson", group: "sle" },
  "9703": { location: "SLE BKE", group: "sle" },
  "9704": { location: "SLE Ulu Sembawang", group: "sle" },
  "9705": { location: "SLE Marsiling Flyover", group: "sle" },
  "9706": { location: "SLE Mandai Flyover", group: "sle" },
};

/** Human-readable label for a camera ID; falls back to `Camera <id>`. */
export function cameraLocationLabel(cameraId: string): string {
  return CAMERA_CATALOG[cameraId.trim()]?.location ?? `Camera ${cameraId}`;
}

/** Expressway / checkpoint group for filter chips. */
export function cameraGroup(cameraId: string): CameraGroup {
  return CAMERA_CATALOG[cameraId.trim()]?.group ?? "other";
}

export type CameraIncidentMatch = {
  readonly incident: TrafficIncident;
  readonly distanceM: number;
};

/** Default search radius (2 km) for pairing road cameras with active incidents. */
export const CAMERA_INCIDENT_RADIUS_M = 2_000;

/**
 * Pair each camera with the closest active road incident within `maxDistanceM`.
 * Returns a lookup keyed by `CameraID`.
 */
export function pairCamerasWithIncidents(
  cameras: ReadonlyArray<TrafficCamera>,
  incidents: ReadonlyArray<TrafficIncident>,
  maxDistanceM: number = CAMERA_INCIDENT_RADIUS_M,
): Map<string, CameraIncidentMatch> {
  const matches = new Map<string, CameraIncidentMatch>();
  if (cameras.length === 0 || incidents.length === 0) return matches;

  for (const camera of cameras) {
    if (!Number.isFinite(camera.Latitude) || !Number.isFinite(camera.Longitude)) {
      continue;
    }
    let best: CameraIncidentMatch | null = null;
    for (const incident of incidents) {
      if (!Number.isFinite(incident.lat) || !Number.isFinite(incident.lng)) {
        continue;
      }
      const dist = distanceM(
        [camera.Longitude, camera.Latitude],
        [incident.lng, incident.lat],
      );
      if (dist <= maxDistanceM && (!best || dist < best.distanceM)) {
        best = { incident, distanceM: dist };
      }
    }
    if (best) {
      matches.set(camera.CameraID, best);
    }
  }
  return matches;
}

export function formatCameraDistance(metres: number): string {
  if (metres < 1_000) return `${Math.max(50, Math.round(metres / 50) * 50)} m`;
  return `${(metres / 1_000).toFixed(1)} km`;
}
