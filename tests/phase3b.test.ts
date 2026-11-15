import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {timePlan,resampleAngles} from '../utils/missionTime';
import {batteryTimeline,legsCandidateTimeline} from '../utils/missionDynamics';
import type {EphemerisRow} from '../utils/terrainAnalysis';
test('timezone offsets and quarter-hour sampling are UTC-normalized',()=>{
  const plan=timePlan('2026-12-10T08:30:00+08:00','2026-12-10T09:00:00+08:00',.25,'Asia/Manila');
  assert.equal(plan.start.toISOString(),'2026-12-10T00:30:00.000Z');
  assert.equal(plan.times.length,3);
  assert.equal(plan.times[2]-plan.times[0],1800000);
});
test('interpolation crosses 0/360 azimuth, not 180 degrees',()=>{
  const a=[{time:'A.D. 2026-Dec-10 00:00',azimuthDeg:359,elevationDeg:0},
    {time:'A.D. 2026-Dec-10 01:00',azimuthDeg:1,elevationDeg:2}];
  const r=resampleAngles(a,[Date.parse('2026-12-10T00:30:00Z')]);
  assert.ok(Math.abs(r[0].azimuthDeg)<1e-7);assert.equal(r[0].elevationDeg,1);
});
test('no-sun battery depletes before 24-hour blackout, without negative SOC',()=>{
  const rows=Array.from({length:25},(_,i)=>({timeUtc:new Date(Date.UTC(2026,11,10,i)).toISOString(),
    estimatedSolarPowerW:0,earthVisible:false})) as EphemerisRow[];
  const result=batteryTimeline(rows,{batteryCapacityWh:250,averageElectricalLoadW:50});
  assert.ok(result&&result.firstPowerShortfallUtc);assert.equal(result?.finalStateOfChargePercent,0);
  assert.ok(result!.unservedLoadWh>0);assert.equal(result?.powerSustained,false);
});
test('LEGS budget does not imply operational contact',()=>{
  const rows=[{timeUtc:'2026-12-10T00:00:00Z',earthVisible:true}] as EphemerisRow[];
  const r=legsCandidateTimeline(rows,{siteId:'legs1-white-sands',direction:'return',band:'X',
    frequencyMHz:8450,assumedRangeKm:384400,propagationAndPointingLossDb:2,
    spacecraftEirpDbw:20,bitRateBps:100000,requiredEbN0Db:4});
  assert.equal(r.actualContactAvailabilityPercent,null);
  assert.equal(r.candidateTimeline[0].actualLEGSContactAvailable,null);
});
