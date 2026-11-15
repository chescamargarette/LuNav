/** LuNav mission analysis core. No external dependencies. */
export type HorizonPoint = { azimuthDeg: number; horizonElevationDeg: number };
export type HorizonProfile = {
  points: HorizonPoint[];
  provenance: {
    source: string;
    sourceUrl?: string;
    coordinateFrame: string;
    heightDatum: string;
    observerHeightM: number;
    siteLatitudeDeg: number;
    siteLongitudeDeg: number;
    method?: string;
  };
  metadata?: {
    siteElevationM?: number | null;
    approxLocalSlopeDeg?: number | null;
    terrainSearchRadiusKm?: number | null;
    radialSamplingMeters?: number | null;
    azimuthSamplingDegrees?: number | null;
    footprintSurfaceAreaM2?: number | null;
    footprintProjectedAreaM2?: number | null;
    footprintRadiusM?: number | null;
  };
};
export type HorizonsObservation = {
  time: string;
  azimuthDeg: number;
  elevationDeg: number;
};
export type EphemerisRow = {
  timeUtc: string;
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  earthAzimuthDeg: number;
  earthElevationDeg: number;
  sunHorizonDeg: number;
  earthHorizonDeg: number;
  sunClearanceDeg: number;
  earthClearanceDeg: number;
  sunVisible: boolean;
  earthVisible: boolean;
  condition: 'SUN_AND_EARTH' | 'SUN_ONLY' | 'EARTH_ONLY' | 'NEITHER';
  directNormalIrradianceWm2: number;
  horizontalIrradianceWm2: number;
  panelIncidenceCosine: number | null;
  panelIncidentIrradianceWm2: number | null;
  estimatedSolarPowerW: number | null;
  solarPowerMeetsThreshold: boolean | null;
  freeSpacePathLossDb: number | null;
  receivedPowerDbm: number | null;
  linkMarginDb: number | null;
  linkFeasible: boolean | null;
  linkEirpDbm: number | null;
  linkSensitivityDbm: number | null;
  linkOtherLossDb: number | null;
};
export type SpacecraftSpecs = {
  solarPanelAreaM2?: number;
  solarPanelEfficiency?: number;
  panelTiltDeg?: number;
  panelFacingAzimuthDeg?: number;
  minSolarPowerW?: number;
  radioFrequencyMHz?: number;
  transmitterEirpDbm?: number;
  receiverGainDbi?: number;
  receiverSensitivityDbm?: number;
  otherLinkLossDb?: number;
  earthDistanceKm?: number; // Assumed slant range unless independently validated.
  minLinkMarginDb?: number;
  maxDarknessHours?: number;
  maxEarthBlackoutHours?: number;
  minSunlightPercent?: number;
  minEarthLosPercent?: number;
  batteryCapacityWh?: number;
  averageElectricalLoadW?: number;
  initialBatterySocPercent?: number;
  batteryReservePercent?: number;
  batteryChargeEfficiency?: number;
  batteryDischargeEfficiency?: number;
  transmitterPowerDbm?: number;
  transmitterAntennaGainDbi?: number;
  transmitterCableLossDb?: number;
  receiverNoiseFigureDb?: number;
  receiverBandwidthHz?: number;
  requiredSnrDb?: number;
  polarizationLossDb?: number;
  pointingLossDb?: number;
  implementationLossDb?: number;
};
export type VisibilitySegment = {
  startUtc: string;
  endUtc: string;
  hours: number;
  sunVisible: boolean;
  earthVisible: boolean;
  condition: EphemerisRow['condition'];
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOUR_MS = 3_600_000;
const SOLAR_CONSTANT = 1361; // W/m2 at 1 AU, approximation, not Horizons-derived.

export function parseHorizonsUtc(text: string): number {
  const m = /^(?:A\.D\.\s*)?(\d{4})-([A-Za-z]{3})-(\d{1,2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text.trim());
  if (!m) throw new Error(`Unsupported Horizons UTC timestamp: ${text}`);
  const month = MONTHS.findIndex(x => x.toLowerCase() === m[2].toLowerCase());
  if (month < 0) throw new Error(`Unknown Horizons month: ${m[2]}`);
  const time = Date.UTC(+m[1], month, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const d = new Date(time);
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== month || d.getUTCDate() !== +m[3]
      || d.getUTCHours() !== +m[4] || d.getUTCMinutes() !== +m[5]) {
    throw new Error(`Invalid Horizons UTC timestamp: ${text}`);
  }
  return time;
}
export function wrap360(value: number): number {
  return ((value % 360) + 360) % 360;
}
const near = (a: number, b: number, tolerance = 1e-6) => Math.abs(a - b) <= tolerance;

export function normalizeProfile(profile: HorizonProfile, siteLatDeg: number, siteLonDeg: number): HorizonPoint[] {
  if (!profile || !Array.isArray(profile.points) || !profile.provenance) {
    throw new Error('terrain_aware requires a full horizon profile and provenance');
  }
  const p = profile.provenance;
  if (!p.source?.trim() || !p.coordinateFrame?.trim() || !p.heightDatum?.trim()
      || !Number.isFinite(p.observerHeightM) || p.observerHeightM < 0
      || !Number.isFinite(p.siteLatitudeDeg) || !Number.isFinite(p.siteLongitudeDeg)) {
    throw new Error('Horizon provenance requires source, frame, datum, observer height and site coordinates');
  }
  const lonDelta = (((p.siteLongitudeDeg - siteLonDeg + 180) % 360) + 360) % 360 - 180;
  if (!near(p.siteLatitudeDeg, siteLatDeg, 0.0001) || !near(lonDelta, 0, 0.0001)) {
    throw new Error('Horizon profile site coordinates do not match the analysis site');
  }
  if (Math.abs(siteLatDeg) === 90 && !p.method?.includes('polar-reference')) {
    throw new Error('At the exact pole the horizon requires an explicit polar-reference azimuth convention');
  }
  const points = profile.points.map(pt => {
    if (!Number.isFinite(pt.azimuthDeg) || !Number.isFinite(pt.horizonElevationDeg)
        || Math.abs(pt.horizonElevationDeg) > 90) {
      throw new Error('Horizon profile contains a non-finite or out-of-range angle');
    }
    return { azimuthDeg: wrap360(pt.azimuthDeg), horizonElevationDeg: pt.horizonElevationDeg };
  }).sort((a, b) => a.azimuthDeg - b.azimuthDeg);
  if (points.length < 12 || points.length > 3601) throw new Error('Horizon profile needs 12–3601 directional samples');
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    const gap = i + 1 < points.length ? next.azimuthDeg - points[i].azimuthDeg : next.azimuthDeg + 360 - points[i].azimuthDeg;
    if (gap < 0.000001) throw new Error('Duplicate azimuths in horizon profile');
    if (gap > 30.00001) throw new Error(`Horizon profile has an unsupported ${gap.toFixed(2)}° azimuth gap`);
  }
  return points;
}

/** Circular piecewise-linear interpolation, including the 359° -> 0° seam. */
export function horizonAtAzimuth(points: HorizonPoint[], azimuthDeg: number): number {
  if (!points.length || !Number.isFinite(azimuthDeg)) throw new Error('Cannot interpolate missing horizon');
  const a = wrap360(azimuthDeg);
  let lo = 0, hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (points[mid].azimuthDeg < a) lo = mid + 1;
    else hi = mid;
  }
  const upper = lo < points.length ? points[lo] : { ...points[0], azimuthDeg: points[0].azimuthDeg + 360 };
  const lower = lo > 0 ? points[lo - 1] : { ...points[points.length - 1], azimuthDeg: points[points.length - 1].azimuthDeg - 360 };
  const adjustedA = lo === points.length && a < lower.azimuthDeg ? a + 360 : a;
  const ratio = (adjustedA - lower.azimuthDeg) / (upper.azimuthDeg - lower.azimuthDeg);
  return lower.horizonElevationDeg + ratio * (upper.horizonElevationDeg - lower.horizonElevationDeg);
}
function condition(sun: boolean, earth: boolean): EphemerisRow['condition'] {
  return sun ? (earth ? 'SUN_AND_EARTH' : 'SUN_ONLY') : (earth ? 'EARTH_ONLY' : 'NEITHER');
}
function optionalFinite(x: number | undefined): boolean { return x === undefined || Number.isFinite(x); }
function validateSpacecraft(s: SpacecraftSpecs): void {
  for (const value of Object.values(s)) {
    if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Invalid spacecraft numeric parameter');
  }
  if ((s.solarPanelAreaM2 !== undefined && s.solarPanelAreaM2 <= 0)
     || (s.solarPanelEfficiency !== undefined && (s.solarPanelEfficiency < 0 || s.solarPanelEfficiency > 1))
     || (s.panelTiltDeg !== undefined && (s.panelTiltDeg < 0 || s.panelTiltDeg > 180))
     || (s.radioFrequencyMHz !== undefined && s.radioFrequencyMHz <= 0)
     || (s.earthDistanceKm !== undefined && s.earthDistanceKm <= 0)
     || (s.otherLinkLossDb !== undefined && s.otherLinkLossDb < 0)
     || (s.maxDarknessHours !== undefined && s.maxDarknessHours < 0)
     || (s.maxEarthBlackoutHours !== undefined && s.maxEarthBlackoutHours < 0)
     || (s.batteryCapacityWh !== undefined && s.batteryCapacityWh <= 0)
     || (s.averageElectricalLoadW !== undefined && s.averageElectricalLoadW < 0)
     || (s.initialBatterySocPercent !== undefined && (s.initialBatterySocPercent < 0 || s.initialBatterySocPercent > 100))
     || (s.batteryReservePercent !== undefined && (s.batteryReservePercent < 0 || s.batteryReservePercent > 100))
     || (s.batteryChargeEfficiency !== undefined && (s.batteryChargeEfficiency <= 0 || s.batteryChargeEfficiency > 1))
     || (s.batteryDischargeEfficiency !== undefined && (s.batteryDischargeEfficiency <= 0 || s.batteryDischargeEfficiency > 1))
     || (s.transmitterCableLossDb !== undefined && s.transmitterCableLossDb < 0)
     || (s.receiverNoiseFigureDb !== undefined && s.receiverNoiseFigureDb < 0)
     || (s.receiverBandwidthHz !== undefined && s.receiverBandwidthHz <= 0)
     || (s.polarizationLossDb !== undefined && s.polarizationLossDb < 0)
     || (s.pointingLossDb !== undefined && s.pointingLossDb < 0)
     || (s.implementationLossDb !== undefined && s.implementationLossDb < 0)) {
    throw new Error('Invalid spacecraft constraint range');
  }
  for (const percent of [s.minSunlightPercent, s.minEarthLosPercent]) {
    if (percent !== undefined && (percent < 0 || percent > 100)) throw new Error('Percentage constraint outside 0–100');
  }
  if (!optionalFinite(s.minLinkMarginDb)) throw new Error('Invalid link margin constraint');
}

export function analyzeObservations(args: {
  sun: HorizonsObservation[];
  earth: HorizonsObservation[];
  terrainMode: 'ideal_horizon' | 'terrain_aware';
  horizonProfile?: HorizonProfile;
  siteLatDeg: number;
  siteLonDeg: number;
  spacecraft?: SpacecraftSpecs;
  requestedStartUtc: string;
  requestedEndUtc: string;
}) {
  const { sun, earth, terrainMode, horizonProfile, siteLatDeg, siteLonDeg, requestedStartUtc, requestedEndUtc } = args;
  const spacecraft = args.spacecraft ?? {};
  validateSpacecraft(spacecraft);
  if (!Array.isArray(sun) || !Array.isArray(earth) || sun.length < 2 || earth.length < 2) {
    throw new Error('Horizons needs at least two Sun and Earth observations');
  }
  const horizon = terrainMode === 'terrain_aware'
    ? normalizeProfile(horizonProfile as HorizonProfile, siteLatDeg, siteLonDeg) : null;
  if (!['ideal_horizon', 'terrain_aware'].includes(terrainMode)) throw new Error('Unknown terrain mode');
  const earthByTime = new Map(earth.map(x => [parseHorizonsUtc(x.time), x]));
  const canPower = spacecraft.solarPanelAreaM2 !== undefined && spacecraft.solarPanelEfficiency !== undefined;
  // Preserve direct-EIRP + measured-sensitivity inputs from Mode 1-3.
  // Optionally derive EIRP from radio power and antenna gain, and derive sensitivity
  // from kTB + noise figure + required SNR (290 K receiver reference temperature).
  const eirpDbm = spacecraft.transmitterEirpDbm ?? (
    spacecraft.transmitterPowerDbm !== undefined && spacecraft.transmitterAntennaGainDbi !== undefined
      ? spacecraft.transmitterPowerDbm + spacecraft.transmitterAntennaGainDbi - (spacecraft.transmitterCableLossDb ?? 0)
      : null);
  const receiverSensitivityDbm = spacecraft.receiverSensitivityDbm ?? (
    spacecraft.receiverBandwidthHz !== undefined && spacecraft.receiverNoiseFigureDb !== undefined
      && spacecraft.requiredSnrDb !== undefined
      ? -173.975 + 10 * Math.log10(spacecraft.receiverBandwidthHz)
          + spacecraft.receiverNoiseFigureDb + spacecraft.requiredSnrDb
      : null);
  const otherLossDb = (spacecraft.otherLinkLossDb ?? 0) + (spacecraft.polarizationLossDb ?? 0)
    + (spacecraft.pointingLossDb ?? 0) + (spacecraft.implementationLossDb ?? 0);
  const canLink = spacecraft.radioFrequencyMHz !== undefined && eirpDbm !== null
    && spacecraft.receiverGainDbi !== undefined && receiverSensitivityDbm !== null
    && spacecraft.earthDistanceKm !== undefined;
  const startMs = Date.parse(requestedStartUtc);
  const endMs = Date.parse(requestedEndUtc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) throw new Error('Invalid requested UTC times');
  const timeline = sun.map(obs => {
    const t = parseHorizonsUtc(obs.time);
    const e = earthByTime.get(t);
    if (!e) throw new Error(`No Earth sample at ${obs.time}`);
    for (const x of [obs.azimuthDeg, obs.elevationDeg, e.azimuthDeg, e.elevationDeg]) {
      if (!Number.isFinite(x)) throw new Error(`Non-finite NASA angle at ${obs.time}`);
    }
    if (obs.elevationDeg < -90 || obs.elevationDeg > 90 || e.elevationDeg < -90 || e.elevationDeg > 90) {
      throw new Error(`Out-of-range NASA elevation at ${obs.time}`);
    }
    const sunHorizonDeg = horizon ? horizonAtAzimuth(horizon, obs.azimuthDeg) : 0;
    const earthHorizonDeg = horizon ? horizonAtAzimuth(horizon, e.azimuthDeg) : 0;
    const sunClearanceDeg = obs.elevationDeg - sunHorizonDeg;
    const earthClearanceDeg = e.elevationDeg - earthHorizonDeg;
    const sunVisible = sunClearanceDeg > 0;
    const earthVisible = earthClearanceDeg > 0;
    const tilt = (spacecraft.panelTiltDeg ?? 0) * Math.PI / 180;
    const sunEl = obs.elevationDeg * Math.PI / 180;
    const panelAz = (spacecraft.panelFacingAzimuthDeg ?? 0) * Math.PI / 180;
    const sunAz = obs.azimuthDeg * Math.PI / 180;
    const incidenceCos = Math.sin(sunEl) * Math.cos(tilt)
      + Math.cos(sunEl) * Math.sin(tilt) * Math.cos(sunAz - panelAz);
    const panelFactor = sunVisible ? Math.max(0, incidenceCos) : 0;
    const estimatedSolarPowerW = canPower
      ? SOLAR_CONSTANT * panelFactor * spacecraft.solarPanelAreaM2! * spacecraft.solarPanelEfficiency! : null;
    const freeSpacePathLossDb = canLink
      ? 32.45 + 20 * Math.log10(spacecraft.earthDistanceKm!) + 20 * Math.log10(spacecraft.radioFrequencyMHz!) : null;
    const receivedPowerDbm = freeSpacePathLossDb !== null
      ? eirpDbm! + spacecraft.receiverGainDbi! - freeSpacePathLossDb - otherLossDb : null;
    const linkMarginDb = receivedPowerDbm !== null ? receivedPowerDbm - receiverSensitivityDbm! : null;
    const linkFeasible = linkMarginDb !== null
      ? earthVisible && linkMarginDb >= (spacecraft.minLinkMarginDb ?? 0) : earthVisible ? null : false;
    const powerOk = estimatedSolarPowerW !== null && spacecraft.minSolarPowerW !== undefined
      ? estimatedSolarPowerW >= spacecraft.minSolarPowerW : null;
    const row: EphemerisRow = {
      timeUtc: new Date(t).toISOString(), sunAzimuthDeg: wrap360(obs.azimuthDeg),
      sunElevationDeg: obs.elevationDeg, earthAzimuthDeg: wrap360(e.azimuthDeg),
      earthElevationDeg: e.elevationDeg, sunHorizonDeg, earthHorizonDeg,
      sunClearanceDeg, earthClearanceDeg, sunVisible, earthVisible,
      condition: condition(sunVisible, earthVisible),
      directNormalIrradianceWm2: sunVisible ? SOLAR_CONSTANT : 0,
      horizontalIrradianceWm2: sunVisible ? SOLAR_CONSTANT * Math.max(0, Math.sin(sunEl)) : 0,
      panelIncidenceCosine: canPower ? incidenceCos : null,
      panelIncidentIrradianceWm2: canPower ? SOLAR_CONSTANT * panelFactor : null,
      estimatedSolarPowerW, solarPowerMeetsThreshold: powerOk,
      freeSpacePathLossDb, receivedPowerDbm, linkMarginDb, linkFeasible,
      linkEirpDbm: eirpDbm, linkSensitivityDbm: receiverSensitivityDbm,
      linkOtherLossDb: canLink ? otherLossDb : null
    };
    return row;
  });
  for (let i = 1; i < timeline.length; i++) {
    if (Date.parse(timeline[i].timeUtc) <= Date.parse(timeline[i-1].timeUtc)) throw new Error('Non-increasing NASA timestamps');
  }
  if (Date.parse(timeline[0].timeUtc) < startMs || Date.parse(timeline[timeline.length-1].timeUtc) > endMs) {
    throw new Error('NASA timestamp outside requested interval');
  }
  if (earthByTime.size !== sun.length) throw new Error('Sun/Earth observation count mismatch');
  const segments: VisibilitySegment[] = [];
  // Split each pair of samples at any linearly interpolated zero-clearance crossings.
  for (let i = 0; i < timeline.length - 1; i++) {
    const a = timeline[i], b = timeline[i + 1];
    const t0 = Date.parse(a.timeUtc), t1 = Date.parse(b.timeUtc);
    const fractions = [0, 1];
    for (const [c0, c1] of [[a.sunClearanceDeg,b.sunClearanceDeg], [a.earthClearanceDeg,b.earthClearanceDeg]]) {
      if ((c0 < 0 && c1 > 0) || (c0 > 0 && c1 < 0)) {
        fractions.push(-c0 / (c1 - c0));
      }
    }
    fractions.sort((x,y) => x-y);
    const unique = fractions.filter((x, ix) => ix === 0 || x - fractions[ix-1] > 1e-10);
    for (let j=0; j<unique.length-1; j++) {
      const u = unique[j], v = unique[j+1], mid = (u+v)/2;
      const vs = a.sunClearanceDeg + mid * (b.sunClearanceDeg-a.sunClearanceDeg) > 0;
      const ve = a.earthClearanceDeg + mid * (b.earthClearanceDeg-a.earthClearanceDeg) > 0;
      const segStart = t0 + u*(t1-t0), segEnd = t0 + v*(t1-t0);
      segments.push({ startUtc: new Date(segStart).toISOString(), endUtc: new Date(segEnd).toISOString(),
        hours: (segEnd-segStart)/HOUR_MS, sunVisible: vs, earthVisible: ve, condition: condition(vs,ve) });
    }
  }
  const totalHours = segments.reduce((a,s) => a+s.hours, 0);
  if (totalHours <= 0) throw new Error('No time interval to evaluate');
  const sunHours = segments.reduce((a,s) => a + (s.sunVisible ? s.hours: 0), 0);
  const earthHours = segments.reduce((a,s) => a + (s.earthVisible ? s.hours: 0), 0);
  const bothHours = segments.reduce((a,s) => a + (s.sunVisible && s.earthVisible ? s.hours: 0), 0);
  const neitherHours = segments.reduce((a,s) => a + (!s.sunVisible && !s.earthVisible ? s.hours: 0), 0);
  function longestBlocked(predicate: (s: VisibilitySegment)=>boolean):number {
    let running=0, max=0;
    for (const s of segments) {
      if (predicate(s)) { running += s.hours; max = Math.max(max,running); }
      else running = 0;
    }
    return max;
  }
  // Link availability uses sampled geometry and a fixed assumed link budget when specified.
  const linkHours = canLink ? earthHours * (timeline[0].linkMarginDb! >= (spacecraft.minLinkMarginDb ?? 0) ? 1 : 0) : null;
  const availability = {
    evaluatedHours: totalHours,
    requestedHours: (endMs-startMs)/HOUR_MS,
    unevaluatedHours: Math.max(0, (endMs-startMs)/HOUR_MS-totalHours),
    coveragePercent: 100*totalHours/((endMs-startMs)/HOUR_MS),
    sunlightHours: sunHours, darknessHours: totalHours-sunHours,
    earthLosHours: earthHours, earthBlackoutHours: totalHours-earthHours,
    simultaneousSunEarthHours: bothHours, neitherHours,
    sunlightPercent: 100*sunHours/totalHours,
    earthLosPercent: 100*earthHours/totalHours,
    simultaneousSunEarthPercent: 100*bothHours/totalHours,
    longestDarknessHours: longestBlocked(s=>!s.sunVisible),
    longestEarthBlackoutHours: longestBlocked(s=>!s.earthVisible),
    longestNeitherHours: longestBlocked(s=>!s.sunVisible && !s.earthVisible),
    linkAvailableHours: linkHours,
    linkAvailabilityPercent: linkHours !== null ? 100*linkHours/totalHours : null
  };
  const batteryEnduranceHours = spacecraft.batteryCapacityWh !== undefined
    && spacecraft.averageElectricalLoadW !== undefined
    ? spacecraft.batteryCapacityWh / spacecraft.averageElectricalLoadW : null;
  const batterySurvivesLongestDarkness = batteryEnduranceHours !== null
    ? batteryEnduranceHours >= availability.longestDarknessHours : null;
  const constraints = [
    ['minSunlightPercent', spacecraft.minSunlightPercent, availability.sunlightPercent, (m:number,v:number)=>m>=v],
    ['minEarthLosPercent', spacecraft.minEarthLosPercent, availability.earthLosPercent, (m:number,v:number)=>m>=v],
    ['maxDarknessHours', spacecraft.maxDarknessHours, availability.longestDarknessHours, (m:number,v:number)=>m<=v],
    ['maxEarthBlackoutHours', spacecraft.maxEarthBlackoutHours, availability.longestEarthBlackoutHours, (m:number,v:number)=>m<=v]
  ].filter(x=>x[1]!==undefined).map(([name, limit, actual, fn])=>({
    name, limit, actual, passes:(fn as (m:number,v:number)=>boolean)(actual as number, limit as number)
  }));
  const warnings = [
    'Clearance and crossing times are linearly interpolated between samples; short events may be missed.',
    'The Sun and Earth are modeled by their centers, without partial disks or terrain uncertainty.',
    'Solar irradiance assumes 1361 W/m2 at 1 AU; Sun-observer range is not yet queried.',
    'Terrain elevation, slope and footprint area are reported only when supplied by DEM-derived metadata; results require independent validation.'
  ];
  if (terrainMode === 'ideal_horizon') warnings.push('Ideal 0-degree horizon only: ignores terrain obstruction.');
  if (terrainMode === 'terrain_aware' && horizonProfile?.metadata?.terrainSearchRadiusKm !== undefined)
    warnings.push(`Terrain horizon includes sampled features within ${horizonProfile.metadata.terrainSearchRadiusKm} km; distant obstructions may be missed.`);
  if (batteryEnduranceHours === null) warnings.push('Battery endurance unavailable without capacity (Wh) and average load (W).');
  if (!canPower) warnings.push('Solar power unavailable: panel area and efficiency must both be supplied.');
  if (!canLink) warnings.push('RF link margin unavailable: frequency, transmitter EIRP (or power/gain), receiver gain, sensitivity (or bandwidth/NF/SNR), and a distance assumption are required.');
  else warnings.push('RF distance is a user-assumed constant, not a Horizons-measured slant range; no antenna pointing, thermal noise or ground-station scheduling model.');
  if (availability.unevaluatedHours > 1e-7) warnings.push('A trailing part of the requested interval is unevaluated; percentages refer only to the evaluated duration.');
  if (Math.abs(siteLatDeg) > 89.9) warnings.push('Very near the lunar pole: verify the azimuth reference frame and relative bearings.');
  return {
    model: terrainMode,
    terrain: {
      source: terrainMode === 'ideal_horizon' ? null : horizonProfile!.provenance,
      siteElevationM: terrainMode === 'terrain_aware' ? (horizonProfile?.metadata?.siteElevationM ?? null) : null,
      localSlopeDeg: terrainMode === 'terrain_aware' ? (horizonProfile?.metadata?.approxLocalSlopeDeg ?? null) : null,
      footprintSurfaceAreaM2: terrainMode === 'terrain_aware'
        ? (horizonProfile?.metadata?.footprintSurfaceAreaM2 ?? null) : null,
      footprintProjectedAreaM2: terrainMode === 'terrain_aware'
        ? (horizonProfile?.metadata?.footprintProjectedAreaM2 ?? null) : null,
      footprintRadiusM: terrainMode === 'terrain_aware'
        ? (horizonProfile?.metadata?.footprintRadiusM ?? null) : null,
      terrainSearchRadiusKm: terrainMode === 'terrain_aware'
        ? (horizonProfile?.metadata?.terrainSearchRadiusKm ?? null) : null,
      profile: terrainMode === 'ideal_horizon' ? null : horizon
    },
    energy: {
      batteryEnduranceHours, batterySurvivesLongestDarkness,
      note: 'Constant load and full usable battery capacity; no charge/discharge dynamics or thermal effects.'
    },
    linkBudget: {
      effectiveEirpDbm: eirpDbm, sensitivityDbm: receiverSensitivityDbm,
      aggregateOtherLossDb: canLink ? otherLossDb : null,
      rangeKm: spacecraft.earthDistanceKm ?? null,
      distanceSource: spacecraft.earthDistanceKm !== undefined ? 'user-assumed fixed range' : 'unavailable',
      sensitivitySource: spacecraft.receiverSensitivityDbm !== undefined ? 'user supplied'
        : receiverSensitivityDbm !== null ? 'kTB + noise figure + required SNR at 290K' : 'unavailable'
    },
    timeline, segments, availability, constraints,
    suitability: constraints.length === 0 ? 'indeterminate' : constraints.every(x=>x.passes) ? 'pass' : 'fail',
    assumptions: {
      solarConstantWm2: SOLAR_CONSTANT, panelModel: 'Fixed orientation, direct illumination only',
      communicationDirection: 'Lunar-surface transmitter to Earth receiver',
      earthDistanceSource: canLink ? 'user-assumed constant range' : 'unavailable',
      linkCriterionDb: spacecraft.minLinkMarginDb ?? 0,
      availabilityMethod: 'duration-weighted, linear clearance crossing interpolation',
      dataQuality: terrainMode === 'terrain_aware' ? 'user-supplied profile; independently validate with DEM' : 'idealized terrain-free model'
    }, warnings
  };
}
