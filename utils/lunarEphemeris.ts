import { LandingSite } from "@/data/mockSites";

export type WhenPreset = "suggested" | "3d" | "1w" | "1m" | "custom";

interface CandidateSiteBase {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  slope_deg: number;
  rimElevationBoostDeg: number;
}

export const CANDIDATE_SITES_BASE: CandidateSiteBase[] = [
  {
    id: "shackleton-rim-01",
    name: "Shackleton Crater Rim",
    region: "Lunar South Pole (Artemis Zone)",
    lat: -89.54,
    lon: 0.0,
    slope_deg: 3.1,
    rimElevationBoostDeg: 6.2,
  },
  {
    id: "connecting-ridge-02",
    name: "Shackleton–de Gerlache Ridge",
    region: "South Pole Connecting Ridge",
    lat: -89.45,
    lon: -137.8,
    slope_deg: 3.8,
    rimElevationBoostDeg: 6.5,
  },
  {
    id: "malapert-massif-03",
    name: "Malapert Massif Peak",
    region: "South Polar Highlands",
    lat: -86.0,
    lon: 12.9,
    slope_deg: 4.4,
    rimElevationBoostDeg: 5.4,
  },
  {
    id: "nobile-rim-04",
    name: "Nobile Crater Western Rim",
    region: "South Polar Region (Artemis Zone)",
    lat: -85.2,
    lon: 53.5,
    slope_deg: 4.1,
    rimElevationBoostDeg: 5.1,
  },
  {
    id: "aristarchus-05",
    name: "Aristarchus Plateau",
    region: "Oceanus Procellarum",
    lat: 23.7,
    lon: -47.4,
    slope_deg: 2.0,
    rimElevationBoostDeg: 0.8,
  },
  {
    id: "mare-tranquillitatis-06",
    name: "Statio Tranquillitatis",
    region: "Sea of Tranquility (Apollo 11)",
    lat: 0.67,
    lon: 23.47,
    slope_deg: 1.4,
    rimElevationBoostDeg: 0.2,
  },
];

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const J2000_EPOCH_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
const SYNODIC_MONTH_DAYS = 29.530588853;
const SIDEREAL_MONTH_DAYS = 27.321661;
const ANOMALISTIC_MONTH_DAYS = 27.55455;
const DRACONIC_MONTH_DAYS = 27.21222;

function normalizeAngle180(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

function normalizeAngle360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function formatDateISO(ms: number): string {
  return new Date(ms).toISOString().split("T")[0];
}

export function solveKepler(meanAnomalyRad: number, ecc: number): number {
  let E = meanAnomalyRad;
  for (let i = 0; i < 6; i++) {
    const f = E - ecc * Math.sin(E) - meanAnomalyRad;
    const fPrime = 1 - ecc * Math.cos(E);
    E -= f / fPrime;
  }
  return E;
}

export interface KeplerianBody {
  name: string;
  semiMajor: number;
  ecc: number;
  incDeg: number;
  raanDeg: number;
  argPeriDeg: number;
  meanAnomalyJ2000Deg: number;
  periodSec: number;
}

export const PLANETARY_EPHEMERIS_J2000: KeplerianBody[] = [
  {
    name: "MERCURY",
    semiMajor: 190,
    ecc: 0.2056,
    incDeg: 7.0,
    raanDeg: 48.33,
    argPeriDeg: 29.12,
    meanAnomalyJ2000Deg: 174.79,
    periodSec: 87.969 * 86400,
  },
  {
    name: "VENUS",
    semiMajor: 300,
    ecc: 0.0068,
    incDeg: 3.39,
    raanDeg: 76.68,
    argPeriDeg: 54.88,
    meanAnomalyJ2000Deg: 50.11,
    periodSec: 224.701 * 86400,
  },
  {
    name: "MARS",
    semiMajor: 450,
    ecc: 0.0934,
    incDeg: 1.85,
    raanDeg: 49.56,
    argPeriDeg: 286.5,
    meanAnomalyJ2000Deg: 19.37,
    periodSec: 686.98 * 86400,
  },
  {
    name: "JUPITER",
    semiMajor: 680,
    ecc: 0.0489,
    incDeg: 1.3,
    raanDeg: 100.46,
    argPeriDeg: 273.87,
    meanAnomalyJ2000Deg: 20.02,
    periodSec: 4332.589 * 86400,
  },
  {
    name: "SATURN",
    semiMajor: 920,
    ecc: 0.0565,
    incDeg: 2.49,
    raanDeg: 113.67,
    argPeriDeg: 339.39,
    meanAnomalyJ2000Deg: 317.02,
    periodSec: 10759.22 * 86400,
  },
];

export function computeKeplerianPosition(
  body: KeplerianBody,
  timestampMs: number
): { x: number; y: number; z: number } {
  const elapsedSec = (timestampMs - J2000_EPOCH_MS) / 1000;
  const meanMotion = (Math.PI * 2) / body.periodSec;
  const M = body.meanAnomalyJ2000Deg * DEG2RAD + meanMotion * elapsedSec;
  const E = solveKepler(M, body.ecc);

  const semiMinor = body.semiMajor * Math.sqrt(1 - body.ecc * body.ecc);
  const xOrb = body.semiMajor * (Math.cos(E) - body.ecc);
  const zOrb = semiMinor * Math.sin(E);

  const w = body.argPeriDeg * DEG2RAD;
  const inc = body.incDeg * DEG2RAD;
  const om = body.raanDeg * DEG2RAD;

  const cosW = Math.cos(w);
  const sinW = Math.sin(w);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);
  const cosO = Math.cos(om);
  const sinO = Math.sin(om);

  const x1 = xOrb * cosW - zOrb * sinW;
  const z1 = xOrb * sinW + zOrb * cosW;

  const y2 = -z1 * sinI;
  const z2 = z1 * cosI;

  return {
    x: x1 * cosO + z2 * sinO,
    y: y2,
    z: -x1 * sinO + z2 * cosO,
  };
}

export function getLunarCelestialAngles(timestampMs: number) {
  const daysSinceNewMoon = (timestampMs - NEW_MOON_EPOCH_MS) / 86400000;
  const daysSinceJ2000 = (timestampMs - J2000_EPOCH_MS) / 86400000;

  const synodicPhase =
    (((daysSinceNewMoon / SYNODIC_MONTH_DAYS) % 1) + 1) % 1;

  const subsolarLon = normalizeAngle180((0.5 - synodicPhase) * 360);
  const subsolarLat =
    1.54 * Math.sin((daysSinceNewMoon / 365.25) * 2 * Math.PI + 1.2);

  const anomAngle = (daysSinceNewMoon / ANOMALISTIC_MONTH_DAYS) * 2 * Math.PI;
  const dracAngle = (daysSinceNewMoon / DRACONIC_MONTH_DAYS) * 2 * Math.PI;

  const subEarthLon = 7.6 * Math.sin(anomAngle);
  const subEarthLat = 6.7 * Math.sin(dracAngle);

  const lunarSiderealRad =
    ((daysSinceJ2000 / SIDEREAL_MONTH_DAYS) * Math.PI * 2) % (Math.PI * 2);

  const earthMeanLonDeg = 100.464 + 0.9856076686 * daysSinceJ2000;
  const earthHelioLonRad = earthMeanLonDeg * DEG2RAD;

  return {
    synodicPhase,
    subsolarLat,
    subsolarLon,
    subEarthLat,
    subEarthLon,
    lunarSiderealRad,
    earthHelioLonRad,
  };
}

function computeTopocentricAzEl(
  siteLatDeg: number,
  siteLonDeg: number,
  targetLatDeg: number,
  targetLonDeg: number,
  horizonBoostDeg = 0
) {
  const phi = siteLatDeg * DEG2RAD;
  const delta = targetLatDeg * DEG2RAD;
  const dLon = (targetLonDeg - siteLonDeg) * DEG2RAD;

  const sinEl =
    Math.sin(phi) * Math.sin(delta) +
    Math.cos(phi) * Math.cos(delta) * Math.cos(dLon);

  const rawElDeg = Math.asin(Math.max(-1, Math.min(1, sinEl))) * RAD2DEG;
  const effectiveElDeg = rawElDeg + horizonBoostDeg;

  const y = Math.sin(dLon) * Math.cos(delta);
  const x =
    Math.cos(phi) * Math.sin(delta) -
    Math.sin(phi) * Math.cos(delta) * Math.cos(dLon);

  const azDeg = normalizeAngle360(Math.atan2(y, x) * RAD2DEG);

  return {
    azimuth: Number(azDeg.toFixed(1)),
    elevation: Number(rawElDeg.toFixed(1)),
    effectiveElevation: effectiveElDeg,
  };
}

function integrateWindowMetrics(
  site: CandidateSiteBase,
  startMs: number,
  durationDays: number
) {
  const samples = Math.max(24, Math.min(180, Math.round(durationDays * 12)));
  const stepMs = (durationDays * 86400000) / samples;

  let sunlitCount = 0;
  let commsCount = 0;

  for (let i = 0; i <= samples; i++) {
    const t = startMs + i * stepMs;
    const { subsolarLat, subsolarLon, subEarthLat, subEarthLon } =
      getLunarCelestialAngles(t);

    const sun = computeTopocentricAzEl(
      site.lat,
      site.lon,
      subsolarLat,
      subsolarLon,
      site.rimElevationBoostDeg
    );
    const earth = computeTopocentricAzEl(
      site.lat,
      site.lon,
      subEarthLat,
      subEarthLon,
      site.rimElevationBoostDeg * 0.85
    );

    if (sun.effectiveElevation > 0) sunlitCount++;
    if (earth.effectiveElevation > 0) commsCount++;
  }

  const total = samples + 1;
  const sunlightPercent = Math.round((sunlitCount / total) * 100);
  const commsHoursPerDay = Number(((commsCount / total) * 24).toFixed(1));

  const touchdown = getLunarCelestialAngles(startMs);
  const sunAtStart = computeTopocentricAzEl(
    site.lat,
    site.lon,
    touchdown.subsolarLat,
    touchdown.subsolarLon,
    site.rimElevationBoostDeg
  );
  const earthAtStart = computeTopocentricAzEl(
    site.lat,
    site.lon,
    touchdown.subEarthLat,
    touchdown.subEarthLon,
    site.rimElevationBoostDeg * 0.85
  );

  return {
    sunlight_percent: sunlightPercent,
    comms_window_hours: commsHoursPerDay,
    sun_azimuth: sunAtStart.azimuth,
    sun_elevation: sunAtStart.elevation,
    earth_azimuth: earthAtStart.azimuth,
    earth_elevation: earthAtStart.elevation,
  };
}

function findOptimal7DayWindow(site: CandidateSiteBase, baseMs: number) {
  let bestStartMs = baseMs;
  let bestScore = -1;
  let bestMetrics = integrateWindowMetrics(site, baseMs, 7);

  for (let dayOffset = 0; dayOffset <= 28; dayOffset += 2) {
    const candidateStart = baseMs + dayOffset * 86400000;
    const metrics = integrateWindowMetrics(site, candidateStart, 7);
    const score =
      metrics.sunlight_percent * 0.65 +
      (metrics.comms_window_hours / 24) * 100 * 0.35;

    if (score > bestScore) {
      bestScore = score;
      bestStartMs = candidateStart;
      bestMetrics = metrics;
    }
  }

  return {
    startMs: bestStartMs,
    endMs: bestStartMs + 7 * 86400000,
    metrics: bestMetrics,
  };
}

// Evaluate any user-picked [lat, lon] coordinate with topocentric ephemeris
export function evaluateCustomCoordinate(
  lat: number,
  lon: number,
  whenPreset: WhenPreset,
  customDate: string,
  referenceNowMs = Date.UTC(2026, 10, 14, 12, 0, 0)
): LandingSite {
  const absLat = Math.abs(lat);
  const isPolar = absLat >= 75;
  const estimatedSlope = Number(
    (1.5 + (absLat / 90) * 3.4 + (Math.abs(Math.sin(lon * DEG2RAD)) * 1.4)).toFixed(1)
  );
  const rimBoost = isPolar ? 3.2 : 0.5;

  const customBase: CandidateSiteBase = {
    id: `custom-target-${lat.toFixed(2)}-${lon.toFixed(2)}`,
    name: `Target Zone (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
    region:
      lat <= -65
        ? "Lunar South Polar Region"
        : lat >= 65
        ? "Lunar North Polar Region"
        : Math.abs(lon) <= 90
        ? "Lunar Near Side"
        : "Lunar Far Side",
    lat,
    lon,
    slope_deg: estimatedSlope,
    rimElevationBoostDeg: rimBoost,
  };

  let startMs = referenceNowMs;
  let durationDays = 7;

  if (whenPreset === "3d") durationDays = 3;
  else if (whenPreset === "1w") durationDays = 7;
  else if (whenPreset === "1m") durationDays = 30;
  else if (whenPreset === "custom" && customDate) {
    const parsed = Date.parse(`${customDate}T12:00:00Z`);
    if (!Number.isNaN(parsed)) {
      startMs = parsed;
      durationDays = 3;
    }
  }

  if (whenPreset === "suggested") {
    const optimal = findOptimal7DayWindow(customBase, referenceNowMs);
    return {
      id: customBase.id,
      name: customBase.name,
      region: customBase.region,
      lat: customBase.lat,
      lon: customBase.lon,
      slope_deg: customBase.slope_deg,
      recommended_window: `${formatDateISO(optimal.startMs)} to ${formatDateISO(
        optimal.endMs
      )}`,
      ...optimal.metrics,
    };
  }

  const metrics = integrateWindowMetrics(customBase, startMs, durationDays);
  const endMs = startMs + durationDays * 86400000;

  return {
    id: customBase.id,
    name: customBase.name,
    region: customBase.region,
    lat: customBase.lat,
    lon: customBase.lon,
    slope_deg: customBase.slope_deg,
    recommended_window: `${formatDateISO(startMs)} to ${formatDateISO(endMs)}`,
    ...metrics,
  };
}

export function evaluateSitesForSchedule(
  whenPreset: WhenPreset,
  customDate: string,
  referenceNowMs = Date.UTC(2026, 10, 14, 12, 0, 0)
): {
  sites: LandingSite[];
  activeTimestampMs: number;
  windowSummary: string;
} {
  let startMs = referenceNowMs;
  let durationDays = 7;
  let windowSummary = "Auto-Suggested Peak Windows (Next 30 Days)";

  if (whenPreset === "3d") {
    durationDays = 3;
    windowSummary = `${formatDateISO(startMs)} to ${formatDateISO(
      startMs + 3 * 86400000
    )} (3-Day Window)`;
  } else if (whenPreset === "1w") {
    durationDays = 7;
    windowSummary = `${formatDateISO(startMs)} to ${formatDateISO(
      startMs + 7 * 86400000
    )} (7-Day Window)`;
  } else if (whenPreset === "1m") {
    durationDays = 30;
    windowSummary = `${formatDateISO(startMs)} to ${formatDateISO(
      startMs + 30 * 86400000
    )} (30-Day Cycle)`;
  } else if (whenPreset === "custom" && customDate) {
    const parsed = Date.parse(`${customDate}T12:00:00Z`);
    if (!Number.isNaN(parsed)) {
      startMs = parsed;
      durationDays = 3;
      windowSummary = `Target Touchdown: ${customDate} (+72h Ops)`;
    }
  }

  const evaluatedSites: LandingSite[] = CANDIDATE_SITES_BASE.map((base) => {
    if (whenPreset === "suggested") {
      const optimal = findOptimal7DayWindow(base, referenceNowMs);
      return {
        id: base.id,
        name: base.name,
        region: base.region,
        lat: base.lat,
        lon: base.lon,
        slope_deg: base.slope_deg,
        recommended_window: `${formatDateISO(optimal.startMs)} to ${formatDateISO(
          optimal.endMs
        )}`,
        ...optimal.metrics,
      };
    }

    const metrics = integrateWindowMetrics(base, startMs, durationDays);
    const endMs = startMs + durationDays * 86400000;

    return {
      id: base.id,
      name: base.name,
      region: base.region,
      lat: base.lat,
      lon: base.lon,
      slope_deg: base.slope_deg,
      recommended_window: `${formatDateISO(startMs)} to ${formatDateISO(endMs)}`,
      ...metrics,
    };
  });

  evaluatedSites.sort((a, b) => {
    const scoreA = a.sunlight_percent + a.comms_window_hours * 2;
    const scoreB = b.sunlight_percent + b.comms_window_hours * 2;
    return scoreB - scoreA;
  });

  return {
    sites: evaluatedSites,
    activeTimestampMs: startMs,
    windowSummary,
  };
}