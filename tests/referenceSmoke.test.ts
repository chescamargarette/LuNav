import { strict as assert } from 'node:assert';
import {test} from 'node:test';
import {MISSION_REFERENCES,nominalTerrainCoverage} from '../utils/missionReferences';
import {computeLegsReturnLink} from '../utils/legsReference';

test('three unique actual landed mission references',()=>{
  assert.equal(MISSION_REFERENCES.length,3);
  assert.equal(new Set(MISSION_REFERENCES.map(x=>x.id)).size,3);
  assert.ok(MISSION_REFERENCES.every(x=>x.missionStatus==='landed'));
});
test('terrain coverage distinguishes IM-2, edge-limited IM-1 and out-of-DEM Chandrayaan-3',()=>{
  assert.equal(nominalTerrainCoverage(-84.79059),'inside_dem_with_30km_margin');
  assert.equal(nominalTerrainCoverage(-80.13),'inside_dem_boundary_limited');
  assert.equal(nominalTerrainCoverage(-69.37),'outside_current_dem');
});
test('LEGS 8.45GHz FSPL matches lunar budget',()=>{
  const r=computeLegsReturnLink({siteId:'legs1-white-sands',band:'X',frequencyMHz:8450,
    lunarToGroundRangeKm:384400,spacecraftEirpDbw:20,bitRateBps:100000,
    totalPropagationAndPointingLossDb:2,requiredEbN0Db:4});
  assert.ok(r.freeSpacePathLossDb>222 && r.freeSpacePathLossDb<223);
  assert.equal(r.actualEndToEndAvailability,null);
  assert.ok(r.linkMarginDb>0);
});
test('wrong link band rejected',()=>{
  assert.throws(()=>computeLegsReturnLink({siteId:'legs1-white-sands',band:'X',frequencyMHz:2200,
    lunarToGroundRangeKm:384400,spacecraftEirpDbw:20,bitRateBps:100000,
    totalPropagationAndPointingLossDb:2,requiredEbN0Db:4}),/outside LEGS return band/);
});
