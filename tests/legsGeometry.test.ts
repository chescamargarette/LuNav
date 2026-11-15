import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {horizonsSurfaceUrl,parseHorizonsSurfaceCsv,groundSitePosition,legsStationNetworkAnalysis} from '../utils/legsGeometry';
const first=Date.parse('2026-12-10T00:00:00Z');
const times=[first,first+3600000,first+7200000];
function fakeTable(timeList:number[],altitudeDeg=40,azimuth=0,rangeAu=.00257){
  return `Some header\nDate_________JDUT, , , Azi_(a-app), Elev_(a-app), delta, deldot,\n$$SOE\n${timeList.map((t,i)=>[
    (t/86400000+2440587.5).toFixed(9),'','',''+(azimuth+i),' '+(altitudeDeg+i),rangeAu,'0.0',''
  ].join(',')).join('\n')}\n$$EOE`;
}
test('NASA JPL surface target query: Moon and Earth bodies plus station coordinates',()=>{
  const url=new URL(horizonsSurfaceUrl('399',{latDeg:32,lonDegEast:-106,altKm:0},'301',
    {latDeg:-89.5,lonDegEast:0,altKm:-.716},times));
  assert.match(url.searchParams.get('COMMAND')! , /@399/);
  assert.equal(url.searchParams.get('CENTER'),"'coord@301'");
  assert.equal(url.searchParams.get('TIME_TYPE'),'UT');
  assert.equal(url.searchParams.get('TLIST_TYPE'),'JD');
});
test('Horizons CSV parser reads angle and AU range with datetime verification',()=>{
  const parsed=parseHorizonsSurfaceCsv(fakeTable(times),times);
  assert.equal(parsed.length,3);assert.equal(parsed[1].azimuthDeg,1);
  assert.ok(parsed[0].rangeKm>380000&&parsed[0].rangeKm<390000);
});
test('reject incomplete station ephemeris instead of inventing visibility',()=>{
  assert.throws(()=>parseHorizonsSurfaceCsv(fakeTable(times.slice(0,2)),times),/expected 3/);
});
test('unverified Australian station must be explicit and user-labeled',()=>{
  assert.equal(groundSitePosition('legs3-australia',{enabled:true}),null);
  const p=groundSitePosition('legs3-australia',{enabled:true,australiaRepresentative:{latDeg:-28.8,lonDegEast:114.6}});
  assert.equal(p?.locationAccuracy,'representative_user_assumed');
});
test('network uses lunar terrain, Earth elevation, range and threshold; never claims operational availability',async()=>{
  const fetcher=(async (input:string|URL|Request)=>{
    const url=new URL(String(input));
    const tlist=url.searchParams.get('TLIST')!;
    const jd=tlist.match(/'([\d.]+)'/g)!.map(s=>Number(s.replaceAll("'",'')));
    const ms=jd.map(x=>(x-2440587.5)*86400000);
    // One direction: station from Moon near horizontal; other: Moon from Earth at +40 deg.
    const moonViewer=url.searchParams.get('CENTER')?.includes('301');
    return {ok:true,json:async()=>({result:fakeTable(ms,moonViewer?2:40,160)})};
  }) as unknown as typeof fetch;
  const profile={points:Array.from({length:360},(_,azimuthDeg)=>({azimuthDeg,horizonElevationDeg:1})),
    provenance:{source:'TEST',coordinateFrame:'TEST',heightDatum:'TEST',observerHeightM:1,siteLatitudeDeg:-89.5,siteLongitudeDeg:0},
    metadata:{siteElevationM:-716}};
  const scenario={siteId:'legs1-white-sands',band:'X' as const,direction:'return' as const,frequencyMHz:8450,
    assumedRangeKm:384400,propagationAndPointingLossDb:2,spacecraftEirpDbw:45,
    bitRateBps:100000,requiredEbN0Db:4};
  const r=await legsStationNetworkAnalysis({lat:-89.5,lon:0,profile,ideal:false,
    timesMs:times,scenario,geometry:{enabled:true,stations:['legs1-white-sands','legs3-australia']},fetcher});
  assert.equal(r.stationResults[0].status,'modeled');
  assert.equal(r.stationResults[1].status,'location_unverified');
  assert.equal(r.actualOperationalAvailability,null);
  assert.equal(r.modeledStationCount,1);
  assert.ok(r.networkUnionSampled.length===3);
});
test('lunar ridge suppresses station contact even with clear Earth-side view and positive RF margin',async()=>{
  const fetcher=(async(input:string|URL|Request)=>{
    const url=new URL(String(input));
    const vals=(url.searchParams.get('TLIST')?.match(/'([\d.]+)'/g)??[]).map(v=>(Number(v.replaceAll("'",''))-2440587.5)*86400000);
    return {ok:true,json:async()=>({result:fakeTable(vals,url.searchParams.get('CENTER')?.includes('301')?2:60,160)})};
  }) as unknown as typeof fetch;
  const profile={points:Array.from({length:360},(_,azimuthDeg)=>({azimuthDeg,horizonElevationDeg:4})),
    provenance:{source:'SYNTHETIC TEST',coordinateFrame:'TEST',heightDatum:'TEST',observerHeightM:1,siteLatitudeDeg:-89.5,siteLongitudeDeg:0},
    metadata:{siteElevationM:-716}};
  const r=await legsStationNetworkAnalysis({lat:-89.5,lon:0,profile,ideal:false,timesMs:times,fetcher,
    scenario:{siteId:'legs1-white-sands',band:'X',direction:'return',frequencyMHz:8450,assumedRangeKm:384400,
      propagationAndPointingLossDb:2,spacecraftEirpDbw:45,bitRateBps:100000,requiredEbN0Db:4},
    geometry:{enabled:true,stations:['legs1-white-sands']}});
  assert.equal(r.modeledNetworkContactPercent,0);
  assert.equal(r.stationResults[0].samples[0].lunarTerrainVisible,false);
});
