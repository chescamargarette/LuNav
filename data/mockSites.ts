import { evaluateSitesForSchedule } from "@/utils/lunarEphemeris";

export interface LandingSite {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  sunlight_percent: number;
  comms_window_hours: number;
  sun_azimuth: number;
  sun_elevation: number;
  earth_azimuth: number;
  earth_elevation: number;
  slope_deg: number;
  recommended_window: string;
}

export const MOCK_SITES: LandingSite[] = evaluateSitesForSchedule(
  "suggested",
  "",
  Date.UTC(2026, 10, 14, 12, 0, 0)
).sites;