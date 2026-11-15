const assert = {
  equal(a: unknown,b: unknown) { if (a !== b) throw new Error(`Expected ${String(b)}, got ${String(a)}`); },
  ok(c: boolean) { if (!c) throw new Error('Assertion failed'); },
  throws(action: () => unknown, regex: RegExp) {
    try { action(); } catch(e) { if (regex.test(String(e))) return; throw new Error(`Wrong exception: ${String(e)}`); }
    throw new Error('Expected an exception');
  }
};
import { analyzeObservations, horizonAtAzimuth, normalizeProfile, type HorizonProfile } from '../utils/terrainAnalysis';
import { terrainApparentDirection } from '../utils/horizonFromPoints';
const profile: HorizonProfile = {
  points: Array.from({length:36},(_,i)=>({azimuthDeg:i*10,horizonElevationDeg:i===0?2:i===35?4:0})),
  provenance:{source:'Synthetic test geometry ONLY',coordinateFrame:'local lunar north-east',heightDatum:'test',
    observerHeightM:1,siteLatitudeDeg:-89.5,siteLongitudeDeg:0}
};
const normalized = normalizeProfile(profile,-89.5,0);
assert.ok(Math.abs(horizonAtAzimuth(normalized,355)-3)<1e-9);
assert.ok(Math.abs(horizonAtAzimuth(normalized,5)-1)<1e-9);
assert.equal(horizonAtAzimuth(normalized,180),0);
assert.throws(()=>normalizeProfile(profile,-89,0),/do not match/);
const times=['2027-Jan-11 00:00','2027-Jan-11 01:00','2027-Jan-11 02:00'];
const sun=[-1,1,-1].map((e,i)=>({time:times[i],azimuthDeg:180,elevationDeg:e}));
const earth=[1,-1,1].map((e,i)=>({time:times[i],azimuthDeg:180,elevationDeg:e}));
const base={sun,earth,siteLatDeg:-89.5,siteLonDeg:0,requestedStartUtc:'2027-01-11T00:00:00Z',requestedEndUtc:'2027-01-11T02:00:00Z'};
const analyzed=analyzeObservations({...base,terrainMode:'ideal_horizon'});
assert.equal(analyzed.availability.sunlightPercent,50);
assert.equal(analyzed.availability.earthLosPercent,50);
assert.equal(analyzed.availability.simultaneousSunEarthPercent,0);
assert.equal(analyzed.availability.longestDarknessHours,0.5);
assert.equal(analyzed.availability.longestEarthBlackoutHours,1);
assert.equal(analyzed.availability.longestNeitherHours,0);
assert.equal(analyzed.timeline[0].estimatedSolarPowerW,null);
const blocked=analyzeObservations({...base,terrainMode:'terrain_aware',horizonProfile:profile,
 spacecraft:{solarPanelAreaM2:2,solarPanelEfficiency:0.25,radioFrequencyMHz:2200,
 transmitterEirpDbm:40,receiverGainDbi:60,receiverSensitivityDbm:-120,earthDistanceKm:384400}});
assert.equal(blocked.terrain.source?.source,'Synthetic test geometry ONLY');
assert.equal(blocked.timeline[0].sunVisible,false);
assert.equal(blocked.timeline[0].estimatedSolarPowerW,0);
assert.equal(blocked.timeline[0].linkFeasible,true);
const missing=analyzeObservations({...base,terrainMode:'ideal_horizon', spacecraft:{solarPanelAreaM2:1,solarPanelEfficiency:0.2}});
assert.equal(missing.timeline[0].estimatedSolarPowerW,0);
assert.throws(()=>analyzeObservations({...base,terrainMode:'terrain_aware'}),/requires a full horizon profile/);
const ridge = terrainApparentDirection({latDeg:0,lonDeg:0,elevationM:0,observerHeightM:0},
 {latDeg:0,lonDeg:0.3299,elevationM:100}); // ~10 km arc length to east
assert.ok(ridge !== null && ridge.azimuthDeg > 89.99 && ridge.azimuthDeg < 90.01);
assert.ok(ridge !== null && ridge.horizonElevationDeg > 0.38 && ridge.horizonElevationDeg < 0.44);
console.log('PASS: profile seam, coordinate guard, crossing integration, power, RF/LOS and missing terrain tests');
