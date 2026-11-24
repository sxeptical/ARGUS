import { describe, expect, test } from "bun:test";
import {
  cameraGroup,
  cameraLocationLabel,
  formatCameraDistance,
  pairCamerasWithIncidents,
} from "@/lib/cameras";
import type { TrafficCamera, TrafficIncident } from "@/types";

describe("camera catalog", () => {
  test("maps known checkpoint, Sentosa, and expressway IDs to readable names and groups", () => {
    expect(cameraLocationLabel("2701")).toBe("Woodlands Causeway (Towards Johor)");
    expect(cameraGroup("2701")).toBe("checkpoints");

    expect(cameraLocationLabel("4703")).toBe("Tuas Second Link");
    expect(cameraGroup("4703")).toBe("checkpoints");

    expect(cameraLocationLabel("4798")).toBe("Sentosa Gateway (Towards Sentosa)");
    expect(cameraGroup("4798")).toBe("sentosa");

    expect(cameraLocationLabel("1001")).toBe("ECP Benjamin Sheares Bridge");
    expect(cameraGroup("1001")).toBe("ecp");
  });

  test("falls back cleanly for unknown camera IDs", () => {
    expect(cameraLocationLabel("A001")).toBe("Camera A001");
    expect(cameraGroup("A001")).toBe("other");
  });
});

describe("pairCamerasWithIncidents", () => {
  const camera = (id: string, lat: number, lng: number): TrafficCamera => ({
    CameraID: id,
    Latitude: lat,
    Longitude: lng,
    ImageLink: "https://images.data.gov.sg/api/traffic-images/test.jpg",
    location: cameraLocationLabel(id),
  });

  const incident = (id: string, type: string, lat: number, lng: number): TrafficIncident => ({
    id,
    type,
    lat,
    lng,
    message: `${type} near ${id}`,
  });

  test("pairs each camera with the closest incident within range and ignores distant ones", () => {
    const cameras = [
      camera("2701", 1.44702, 103.77165), // Woodlands Causeway
      camera("4703", 1.3487, 103.63504), // Tuas Second Link (~18 km away)
    ];
    const incidents = [
      incident("far", "Vehicle Breakdown", 1.440, 103.77165), // ~780 m
      incident("near", "Accident", 1.4455, 103.77165), // ~170 m
    ];

    const matches = pairCamerasWithIncidents(cameras, incidents, 2_000);
    expect(matches.size).toBe(1);
    expect(matches.get("2701")?.incident.id).toBe("near");
    expect(matches.get("2701")!.distanceM).toBeLessThan(250);
    expect(matches.has("4703")).toBe(false);
  });

  test("formats short and long distances cleanly", () => {
    expect(formatCameraDistance(12)).toBe("50 m");
    expect(formatCameraDistance(420)).toBe("400 m");
    expect(formatCameraDistance(1_350)).toBe("1.4 km");
  });
});
