/**
 * NEA air-quality bands: the 24-hr PSI health descriptors and the 1-hr PM2.5
 * concentration bands, as published on haze.gov.sg. Pure and dependency-free
 * so the API client, weather panel, map overlay, and signal digest agree.
 */
import type { AirQualityTone, Pm25Band, PsiStatus } from "@/types";

export const PSI_BANDS: ReadonlyArray<{
  status: Exclude<PsiStatus, "Unknown">;
  range: string;
  max: number;
}> = [
  { status: "Good", range: "0–50", max: 50 },
  { status: "Moderate", range: "51–100", max: 100 },
  { status: "Unhealthy", range: "101–200", max: 200 },
  { status: "Very Unhealthy", range: "201–300", max: 300 },
  { status: "Hazardous", range: "301+", max: Infinity },
];

export const PM25_BANDS: ReadonlyArray<{
  band: Exclude<Pm25Band, "Unknown">;
  label: string;
  range: string;
  max: number;
}> = [
  { band: "Normal", label: "I · Normal", range: "0–55", max: 55 },
  { band: "Elevated", label: "II · Elevated", range: "56–150", max: 150 },
  { band: "High", label: "III · High", range: "151–250", max: 250 },
  { band: "Very High", label: "IV · Very High", range: "251+", max: Infinity },
];

export const getPsiStatus = (psi: number | null): PsiStatus => {
  if (psi === null || !Number.isFinite(psi)) return "Unknown";
  return PSI_BANDS.find((band) => psi <= band.max)?.status ?? "Hazardous";
};

export const getPm25Band = (pm25: number | null): Pm25Band => {
  if (pm25 === null || !Number.isFinite(pm25)) return "Unknown";
  return PM25_BANDS.find((band) => pm25 <= band.max)?.band ?? "Very High";
};

export const psiTone = (status: PsiStatus): AirQualityTone => {
  switch (status) {
    case "Good":
      return "success";
    case "Moderate":
      return "warning";
    case "Unknown":
      return "muted";
    default:
      return "danger";
  }
};

export const pm25Tone = (band: Pm25Band): AirQualityTone => {
  switch (band) {
    case "Normal":
      return "success";
    case "Elevated":
      return "warning";
    case "Unknown":
      return "muted";
    default:
      return "danger";
  }
};
