/**
 * Source-backed lunar historical landing references for LuNAv.
 * Published specifications are kept distinct from hypothetical engineering inputs.
 * Date of review: 2026-11-15.
 */

export type CommArchitecture = 'direct_to_earth' | 'rover_to_lander_to_earth' | 'unverified';
export type TerrainCoverage = 'inside_dem_with_30km_margin' | 'inside_dem_boundary_limited' | 'outside_current_dem';

export type MissionReference = {
  id: string;
  label: string;
  agencyOrOperator: string;
  country: string;
  spacecraft: string;
  spacecraftType: 'lander' | 'lander_and_rover';
  landingDateUtc: string;
  siteName: string;
  latDeg: number;
  lonDegEast: number;
  coordinatePrecision: 'approximate' | 'published_exact';
  missionStatus: 'landed';
  published: {
    roverPublishedPowerW: number | null;
    landerPublishedPowerW: number | null;
    batteryCapacityWh: number | null;
    solarPanelAreaM2: number | null;
    transmitterEirpDbw: number | null;
    radioBand: string | null;
    missionDurationPlannedHours: number | null;
    missionDurationActualHours: number | null;
    communicationArchitecture: CommArchitecture;
    historicalGroundNetwork: string | null;
  };
  warnings: string[];
  sourceUrls: string[];
};

export const MISSION_REFERENCES: MissionReference[] = [
  {
    id: 'im2-athena', label: 'IM-2 Athena (2025)', agencyOrOperator: 'Intuitive Machines / NASA CLPS',
    country: 'United States', spacecraft: 'Nova-C Athena', spacecraftType: 'lander',
    landingDateUtc: '2025-03-06', siteName: 'Near Mons Mouton',
    latDeg: -84.79059, lonDegEast: 29.19567, coordinatePrecision: 'published_exact', missionStatus: 'landed',
    published: {
      roverPublishedPowerW: null, landerPublishedPowerW: null, batteryCapacityWh: null,
      solarPanelAreaM2: null, transmitterEirpDbw: null, radioBand: null,
      missionDurationPlannedHours: 240, missionDurationActualHours: 12,
      communicationArchitecture: 'unverified', historicalGroundNetwork: null,
    },
    warnings: [
      'NASA payload delivery on a commercial lander; not a NASA-owned lander.',
      'Actual operation was curtailed following a tipped landing.',
      'A full public power/radio hardware budget was not established by the reviewed sources.',
    ],
    sourceUrls: [
      'https://ntrs.nasa.gov/api/citations/20260003150/downloads/MSolo%20PRIME-1%20overview%20and%20results%20-%20LSSW.pdf',
      'https://www.nasa.gov/news-release/nasa-receives-some-data-before-intuitive-machines-ends-lunar-mission/',
    ],
  },
  {
    id: 'im1-odysseus', label: 'IM-1 Odysseus (2024)', agencyOrOperator: 'Intuitive Machines / NASA CLPS',
    country: 'United States', spacecraft: 'Nova-C Odysseus', spacecraftType: 'lander',
    landingDateUtc: '2024-02-22', siteName: 'Near Malapert A',
    latDeg: -80.13, lonDegEast: 1.44, coordinatePrecision: 'approximate', missionStatus: 'landed',
    published: {
      roverPublishedPowerW: null, landerPublishedPowerW: null, batteryCapacityWh: null,
      solarPanelAreaM2: null, transmitterEirpDbw: null, radioBand: null,
      missionDurationPlannedHours: null, missionDurationActualHours: null,
      communicationArchitecture: 'unverified', historicalGroundNetwork: null,
    },
    warnings: [
      'Only about 4 km south of the northern boundary of the current 80S-90S DEM: a 30 km horizon cannot be fully sampled from this raster.',
      'NASA payload delivery on a commercial lander; not a NASA-owned lander.',
      'A full public power/radio hardware budget was not established by the reviewed sources.',
    ],
    sourceUrls: ['https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/'],
  },
  {
    id: 'chandrayaan3', label: 'Chandrayaan-3 (2023)', agencyOrOperator: 'Indian Space Research Organisation (ISRO)',
    country: 'India', spacecraft: 'Vikram lander + Pragyan rover', spacecraftType: 'lander_and_rover',
    landingDateUtc: '2023-08-23', siteName: 'Shiv Shakti Point',
    latDeg: -69.37, lonDegEast: 32.32, coordinatePrecision: 'approximate', missionStatus: 'landed',
    published: {
      roverPublishedPowerW: 50, landerPublishedPowerW: 738,
      batteryCapacityWh: null, solarPanelAreaM2: null, transmitterEirpDbw: null, radioBand: null,
      missionDurationPlannedHours: 14 * 24, missionDurationActualHours: null,
      communicationArchitecture: 'rover_to_lander_to_earth', historicalGroundNetwork: 'Indian Deep Space Network (IDSN)',
    },
    warnings: [
      'Outside the current 80S-90S LOLA raster. Show terrain unavailable rather than substituting the ideal horizon.',
      '50 W is a published rover power rating, NOT verified constant load, array output time series, or battery capacity.',
      'Pragyan did not have a direct-to-Earth link; its rover-to-lander hop must be modeled separately.',
      'NASA LEGS was not the actual historical communication network for Chandrayaan-3.',
    ],
    sourceUrls: [
      'https://www.isro.gov.in/Chandrayaan3_Details.html',
      'https://www.isro.gov.in/Ch3_Alpha_Particle_X-ray_Spectrometer.html',
    ],
  },
];

export const CURRENT_LOLA_DEM = {
  name: 'LDEM_80S_80MPP_ADJ.TIF', nominalGridMeters: 80,
  minLatDeg: -90, maxLatDeg: -80,
  sourceUrl: 'https://pgda.gsfc.nasa.gov/products/90',
  note: 'This only assesses nominal latitude coverage, not missing raster pixels, full horizon validity, or available precomputed profiles.',
} as const;

export function nominalTerrainCoverage(latitude: number, searchRadiusKm = 30): TerrainCoverage {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > -80) return 'outside_current_dem';
  // Conservative surface-distance check to northern edge; one degree of lunar latitude ~30.32 km.
  const distanceToNorthernEdgeKm = (-80 - latitude) * Math.PI / 180 * 1737.4;
  return distanceToNorthernEdgeKm < searchRadiusKm ? 'inside_dem_boundary_limited' : 'inside_dem_with_30km_margin';
}

export function listMissionReferences() {
  return MISSION_REFERENCES.map(m => ({
    ...m,
    terrainCoverage: nominalTerrainCoverage(m.latDeg),
    terrainProfileStatus: 'not_checked_consult_lola_catalog', // Check GET /api/lola/sites; do not assume a historical landing has been exported.
  }));
}
