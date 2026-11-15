/** Lunar surface <-> Earth surface angular geometry via JPL Horizons surface-target ephemerides.
 * No independent GMST/Moon-frame approximation: Horizons applies planetary rotation models.
 * NASA Horizons docs: https://ssd.jpl.nasa.gov/horizons/manual.html (Surface Targets).
 */
import type {HorizonProfile,HorizonPoint} from './terrainAnalysis';
import {horizonAtAzimuth,normalizeProfile} from './terrainAnalysis';
import {computeLegsForwardLink,computeLegsReturnLink, LEGS_SITES} from './legsReference';
import type {LegsScenario} from './missionDynamics';

const AU_KM=149597870.7;
const MAX_SAMPLES=145;
const MAX_POINTS_PER_HORIZONS_QUERY=35;
export type GroundSitePosition={latDeg:number;lonDegEast:number;altKm:number;locationAccuracy:'documented_site_or_complex'|'representative_user_assumed';sourceUrl:string;note:string};
export type LegsGeometryOptions={enabled:true;groundMinimumElevationDeg?:number;stations?:string[];australiaRepresentative?:{latDeg:number;lonDegEast:number;altKm?:number}};
export type SiteCoords={lat:number;lon:number;siteHeightMeters:number;observerHeightMeters:number};
export type StationAngles={azimuthDeg:number;elevationDeg:number;rangeKm:number};
export type HorizonsFetcher=typeof fetch;

export const DOCUMENTED_LEGS_COORDINATES:Record<string,GroundSitePosition|null>={
  'legs1-white-sands':{
    latDeg:32.544863,lonDegEast:-106.612504,altKm:0,locationAccuracy:'documented_site_or_complex',
    sourceUrl:'https://explorers.larc.nasa.gov/2023APPROBE/pdf_files/Prog05d.%20LEGS%20Brochure%20r20.pdf',
    note:'NASA-published White Sands LEGS reference coordinates; antenna pad height unknown, ellipsoid altitude assumed 0 km.'
  },
  'legs2-matjiesfontein':{
    latDeg:-33.2430694,lonDegEast:20.5480778,altKm:0,locationAccuracy:'documented_site_or_complex',
    sourceUrl:'https://www.etenders.gov.za/home/Download?blobName=b483c4b2-af1b-4861-8821-987e7c6422ab.pdf&downloadedFileName=Extract+from+Design+Development+Report-+Matjiesfontein+Fence.pdf',
    note:'Approximate SANSA Matjiesfontein ground-site center reported in a 2026 civil site report, not a surveyed LEGS antenna phase center; altitude assumed 0 km.'
  },
  'legs3-australia':null
};

function assertLocation(p:{latDeg:number;lonDegEast:number;altKm:number}) {
  if(![p.latDeg,p.lonDegEast,p.altKm].every(Number.isFinite)||p.latDeg < -90||p.latDeg>90||p.lonDegEast<-180||p.lonDegEast>180||p.altKm < -1||p.altKm>10)
    throw new Error('Station coordinates must be valid latitude/longitude and altitude (km)');
}
export function groundSitePosition(siteId:string, opts:LegsGeometryOptions):GroundSitePosition|null{
  if(!LEGS_SITES.some(s=>s.id===siteId))throw new Error(`Unknown LEGS station ${siteId}`);
  if(siteId==='legs3-australia'&&opts.australiaRepresentative){
    const p={...opts.australiaRepresentative,altKm:opts.australiaRepresentative.altKm??0};assertLocation(p);
    return {...p,locationAccuracy:'representative_user_assumed',
      sourceUrl:'https://explorers.larc.nasa.gov/2023APPROBE/pdf_files/LEGS%20Brochure%20r25%201.pdf',
      note:'USER-SUPPLIED hypothetical Australian station coordinate, NOT verified NASA LEGS #3 location.'};
  }
  return DOCUMENTED_LEGS_COORDINATES[siteId]??null;
}
function jdFromMs(ms:number){return (ms/86400000+2440587.5).toFixed(9);}
export function horizonsSurfaceUrl(targetBody:'399'|'301',target:{latDeg:number;lonDegEast:number;altKm:number},
    observerBody:'399'|'301',observer:{latDeg:number;lonDegEast:number;altKm:number},timesMs:number[]):string{
  const q=new URLSearchParams({
    format:'json',MAKE_EPHEM:'YES',OBJ_DATA:'NO',EPHEM_TYPE:'OBSERVER',
    COMMAND:`'g:${target.lonDegEast},${target.latDeg},${target.altKm}@${targetBody}'`,
    CENTER:`'coord@${observerBody}'`,COORD_TYPE:'GEODETIC',
    SITE_COORD:`'${observer.lonDegEast},${observer.latDeg},${observer.altKm}'`,
    TLIST:timesMs.map(t=>`'${jdFromMs(t)}'`).join(' '),TLIST_TYPE:'JD',TIME_TYPE:'UT',
    QUANTITIES:'\'4,20\'',ANG_FORMAT:'DEG',CAL_FORMAT:'JD',CSV_FORMAT:'YES',APPARENT:'AIRLESS',
    EXTRA_PREC:'NO',SUPPRESS_RANGE_RATE:'YES',RANGE_UNITS:'AU',
  });
  return `https://ssd.jpl.nasa.gov/api/horizons.api?${q}`;
}
/** Parses comma-separated Horizons observer lines using field labels, not column hardcoded indices. */
export function parseHorizonsSurfaceCsv(text:string,expectedTimes:number[]):StationAngles[]{
  const lines=text.split(/\r?\n/),start=lines.findIndex(l=>l.trim()==='$$SOE'),end=lines.findIndex(l=>l.trim()==='$$EOE');
  if(start<0||end<start)throw new Error(`No Horizons ephemeris table: ${text.slice(0,300).replace(/\s+/g,' ')}`);
  const header=lines.slice(Math.max(0,start-28),start).reverse().find(s=>/Date.*JDUT/i.test(s)&&/,/.test(s));
  if(!header)throw new Error('Horizons CSV has no JDUT column header');
  const h=header.split(',').map(s=>s.trim());
  const jdIdx=h.findIndex(s=>/Date.*JDUT/i.test(s));
  const azIdx=h.findIndex(s=>/^Azi(?:muth)?_.*\(a-app\)/i.test(s));
  const elIdx=h.findIndex(s=>/^Elev(?:ation)?_.*\(a-app\)/i.test(s));
  const dIdx=h.findIndex(s=>/^delta$/i.test(s));
  if([jdIdx,azIdx,elIdx,dIdx].some(i=>i<0))throw new Error(`Missing expected Horizons CSV fields: ${h.join(' | ')}`);
  const data=lines.slice(start+1,end).filter(s=>s.trim()).map(s=>s.split(',').map(x=>x.trim()));
  if(data.length!==expectedTimes.length)throw new Error(`Horizons returned ${data.length} rows, expected ${expectedTimes.length}; refusing partial station coverage`);
  return data.map((cells,i)=>{
    const jd=Number(cells[jdIdx]);
    const az=Number(cells[azIdx]),el=Number(cells[elIdx]),deltaAu=Number(cells[dIdx]);
    if(![jd,az,el,deltaAu].every(Number.isFinite)||Math.abs((jd-2440587.5)*86400000-expectedTimes[i])>3000||
      az<0||az>=360.00001||el < -90||el>90||deltaAu<0.00001||deltaAu>0.1)
      throw new Error(`Invalid/mismatched Horizons surface geometry at row ${i}`);
    return {azimuthDeg:az%360,elevationDeg:el,rangeKm:deltaAu*AU_KM};
  });
}
export async function getStationEphemerides(site:SiteCoords,ground:GroundSitePosition,timesMs:number[],fetcher:HorizonsFetcher=fetch){
  if(timesMs.length<2||timesMs.length>MAX_SAMPLES||timesMs.some(t=>!Number.isFinite(t)))
    throw new Error(`LEGS geometry supports 2–${MAX_SAMPLES} time samples; increase sampling interval`);
  const lunar={latDeg:site.lat,lonDegEast:site.lon,altKm:(site.siteHeightMeters+site.observerHeightMeters)/1000};
  const groundCenter={latDeg:ground.latDeg,lonDegEast:ground.lonDegEast,altKm:ground.altKm};
  const moonToStation:StationAngles[]=[],stationToMoon:StationAngles[]=[];
  for(let i=0;i<timesMs.length;i+=MAX_POINTS_PER_HORIZONS_QUERY){
    const group=timesMs.slice(i,i+MAX_POINTS_PER_HORIZONS_QUERY);
    // Both directions use JPL's body rotations. Earth-side and lunar-side observer angles are NOT interchangeable.
    const urls=[horizonsSurfaceUrl('399',groundCenter,'301',lunar,group),
      horizonsSurfaceUrl('301',lunar,'399',groundCenter,group)];
    const responses=await Promise.all(urls.map(url=>fetcher(url,{signal:AbortSignal.timeout(25000)})));
    const parsed=await Promise.all(responses.map(async (resp)=>{
      if(!resp.ok)throw new Error(`NASA Horizons HTTP ${resp.status}`);
      const data=await resp.json() as {error?:string;result?:string};
      if(data.error)throw new Error(`NASA Horizons: ${data.error.slice(0,350)}`);
      if(typeof data.result!=='string')throw new Error('NASA Horizons returned no table');
      return parseHorizonsSurfaceCsv(data.result,group);
    }));
    moonToStation.push(...parsed[0]);stationToMoon.push(...parsed[1]);
  }
  return {moonToStation,stationToMoon};
}
function segmentWindows(rows:{timeUtc:string;lunarClearanceDeg:number;groundClearanceDeg:number;linkMarginDb:number}[]){
  const windows:{startUtc:string;endUtc:string;durationHours:number}[]=[];
  let total=0,open:number|null=null;
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1],t0=Date.parse(a.timeUtc),t1=Date.parse(b.timeUtc);
    if(!(t1>t0))throw new Error('Non-increasing LEGS timestamps');
    const pair:[[number,number],[number,number],[number,number]]=[
      [a.lunarClearanceDeg,b.lunarClearanceDeg],[a.groundClearanceDeg,b.groundClearanceDeg],[a.linkMarginDb,b.linkMarginDb]];
    const knots=[0,1];
    for(const [c0,c1] of pair)if(c0*c1<0)knots.push(-c0/(c1-c0));
    knots.sort((x,y)=>x-y);
    for(let k=0;k<knots.length-1;k++){
      const f0=knots[k],f1=knots[k+1],mid=(f0+f1)/2;
      const available=pair.every(([v0,v1])=>v0+(v1-v0)*mid>0);
      const begin=t0+f0*(t1-t0),finish=t0+f1*(t1-t0);
      if(available){total+=(finish-begin)/3600000;if(open===null)open=begin;}
      else if(open!==null){windows.push({startUtc:new Date(open).toISOString(),endUtc:new Date(begin).toISOString(),durationHours:(begin-open)/3600000});open=null;}
    }
  }
  if(open!==null){const finish=Date.parse(rows[rows.length-1].timeUtc);
    windows.push({startUtc:new Date(open).toISOString(),endUtc:new Date(finish).toISOString(),durationHours:(finish-open)/3600000});}
  const period=(Date.parse(rows[rows.length-1].timeUtc)-Date.parse(rows[0].timeUtc))/3600000;
  return {windows,modeledContactHours:total,modeledContactPercent:period>0?100*total/period:null,
    timeWeightingMethod:'Piecewise-linear interpolation of Moon-side terrain clearance, ground-site clearance and RF margin between computed samples'};
}
export async function legsStationNetworkAnalysis({lat,lon,profile,ideal,timesMs,scenario,geometry,fetcher=fetch}:{
  lat:number;lon:number;profile?:HorizonProfile;ideal:boolean;timesMs:number[];scenario:LegsScenario;
  geometry:LegsGeometryOptions;fetcher?:HorizonsFetcher;
}){
  if(!geometry.enabled)throw new Error('LEGS geometry is not enabled');
  if(timesMs.length<2||timesMs.length>MAX_SAMPLES)throw new Error(`LEGS geometry supports at most ${MAX_SAMPLES} timestamps. Increase interval.`);
  const minEl=geometry.groundMinimumElevationDeg??10;
  if(!Number.isFinite(minEl)||minEl<0||minEl>45)throw new Error('Ground minimum Moon elevation must be between 0° and 45°');
  const stations=geometry.stations??LEGS_SITES.map(s=>s.id);
  if(!Array.isArray(stations)||stations.length<1||stations.length>3||new Set(stations).size!==stations.length||
     stations.some(id=>!LEGS_SITES.some(s=>s.id===id)))throw new Error('Invalid LEGS station list');
  const pts:HorizonPoint[]=profile?normalizeProfile(profile,lat,lon):[];
  if(!ideal&&!profile)throw new Error('Terrain-aware LEGS visibility requires a real or supplied horizon profile');
  const height=profile?.metadata?.siteElevationM;
  if(!ideal&&(typeof height!=='number'||!Number.isFinite(height)))throw new Error('Station geometry requires DEM-derived site elevation metadata');
  const observerHeightM=profile?.provenance.observerHeightM??0;
  const groundData:Array<{stationId:string;status:string;position:GroundSitePosition|null;modeledContactPercent:number|null;
    modeledContactHours?:number;windows:{startUtc:string;endUtc:string;durationHours:number}[];
    samples:{timeUtc:string;lunarAzimuthDeg:number;lunarElevationDeg:number;lunarHorizonDeg:number;
      lunarClearanceDeg:number;groundMoonAzimuthDeg:number;groundMoonElevationDeg:number;groundClearanceDeg:number;
      slantRangeKm:number;freeSpacePathLossDb:number;linkMarginDb:number;budgetAboveThreshold:boolean;
      lunarTerrainVisible:boolean;groundMoonVisible:boolean;geometricLinkAvailable:boolean;operationalContactAvailable:null}[];
    reason:string;timeWeightingMethod?:string}>=[];
  await Promise.all(stations.map(async(id)=>{
    const position=groundSitePosition(id,geometry);
    if(!position){groundData.push({stationId:id,status:'location_unverified',position:null,modeledContactPercent:null,
      samples:[],windows:[],reason:'No verified LEGS #3 coordinates. Supply a clearly labeled hypothetical Australian representative location if needed.'});return;}
    try{
      const obs=await getStationEphemerides({lat,lon,siteHeightMeters:typeof height==='number'?height:0,observerHeightMeters:observerHeightM},position,timesMs,fetcher);
      const samples=timesMs.map((t,i)=>{
        const moon=obs.moonToStation[i],earth=obs.stationToMoon[i];
        const horizon=ideal?0:horizonAtAzimuth(pts,moon.azimuthDeg);
        const lunarClearance=moon.elevationDeg-horizon;
        const groundClearance=earth.elevationDeg-minEl;
        const l=scenario.direction==='return'
          ? computeLegsReturnLink({siteId:id,band:scenario.band,frequencyMHz:scenario.frequencyMHz,
              lunarToGroundRangeKm:moon.rangeKm,spacecraftEirpDbw:scenario.spacecraftEirpDbw!,
              bitRateBps:scenario.bitRateBps!,requiredEbN0Db:scenario.requiredEbN0Db!,
              totalPropagationAndPointingLossDb:scenario.propagationAndPointingLossDb,
              groundImplementationLossDb:scenario.implementationLossDb})
          : computeLegsForwardLink({direction:'forward',siteId:id,band:scenario.band,frequencyMHz:scenario.frequencyMHz,
              lunarToGroundRangeKm:moon.rangeKm,spacecraftReceiverGainDbi:scenario.roverReceiverGainDbi!,
              spacecraftReceiverSensitivityDbm:scenario.roverReceiverSensitivityDbm!,
              totalPropagationAndPointingLossDb:scenario.propagationAndPointingLossDb,
              requiredPowerMarginDb:scenario.minimumPowerMarginDb});
        const margin='linkMarginDb' in l?l.linkMarginDb:l.powerMarginDb;
        return {timeUtc:new Date(t).toISOString(),lunarAzimuthDeg:moon.azimuthDeg,lunarElevationDeg:moon.elevationDeg,
          lunarHorizonDeg:horizon,lunarClearanceDeg:lunarClearance,groundMoonAzimuthDeg:earth.azimuthDeg,
          groundMoonElevationDeg:earth.elevationDeg,groundClearanceDeg:groundClearance,
          slantRangeKm:moon.rangeKm,freeSpacePathLossDb:l.freeSpacePathLossDb,
          linkMarginDb:margin,budgetAboveThreshold:l.budgetAboveThreshold,
          lunarTerrainVisible:lunarClearance>0,groundMoonVisible:groundClearance>0,
          geometricLinkAvailable:lunarClearance>0&&groundClearance>0&&l.budgetAboveThreshold,
          operationalContactAvailable:null};
      });
      const summary=segmentWindows(samples);
      groundData.push({stationId:id,status:'modeled',position,
        modeledContactPercent:summary.modeledContactPercent,modeledContactHours:summary.modeledContactHours,
        windows:summary.windows,samples,...{timeWeightingMethod:summary.timeWeightingMethod},
        reason:'Geometric and preliminary RF viability only; station scheduling/commissioning not evaluated.'});
    }catch(e){groundData.push({stationId:id,status:'ephemeris_error',position,modeledContactPercent:null,
      samples:[],windows:[],reason:e instanceof Error?e.message:String(e)});}
  }));
  groundData.sort((a,b)=>stations.indexOf(a.stationId)-stations.indexOf(b.stationId));
  // An approximate network union can only be computed if each modeled station's ephemeris is complete.
  // Unverified stations do not enter the union. Subhour transitions between stations remain approximations.
  const valid=groundData.filter(x=>x.status==='modeled'&&x.samples.length===timesMs.length);
  const networkUnion=valid.length?timesMs.map((t,i)=>({timeUtc:new Date(t).toISOString(),
      availableStations:valid.filter(s=>s.samples[i].geometricLinkAvailable).map(s=>s.stationId),
      bestStationId:valid.filter(s=>s.samples[i].geometricLinkAvailable)
        .sort((a,b)=>b.samples[i].linkMarginDb-a.samples[i].linkMarginDb)[0]?.stationId??null,
      bestMarginDb:Math.max(...valid.filter(s=>s.samples[i].geometricLinkAvailable).map(s=>s.samples[i].linkMarginDb),-Infinity),
    })).map(row=>({...row,bestMarginDb:Number.isFinite(row.bestMarginDb)?row.bestMarginDb:null})):[];
  const merged:{startUtc:string;endUtc:string;durationHours:number}[]=[];
  const rawWindows=valid.flatMap(s=>s.windows).sort((a,b)=>Date.parse(a.startUtc)-Date.parse(b.startUtc));
  for(const w of rawWindows){
    const last=merged[merged.length-1];
    if(last&&Date.parse(w.startUtc)<=Date.parse(last.endUtc)){
      if(Date.parse(w.endUtc)>Date.parse(last.endUtc))last.endUtc=w.endUtc;
      last.durationHours=(Date.parse(last.endUtc)-Date.parse(last.startUtc))/3600000;
    }else merged.push({...w});
  }
  const networkHours=merged.reduce((sum,w)=>sum+w.durationHours,0);
  const timeSpanHours=(timesMs[timesMs.length-1]-timesMs[0])/3600000;
  return {model:'station_specific_Horizons_surface_target_predicted_geometry',groundMinimumElevationDeg:minEl,
    stationResults:groundData,networkUnionSampled:networkUnion,modeledNetworkWindows:merged,
    modeledNetworkContactHours:valid.length?networkHours:null,
    modeledNetworkContactPercent:valid.length?100*networkHours/timeSpanHours:null,
    modeledStationCount:valid.length,unmodeledStationCount:groundData.length-valid.length,
    actualOperationalAvailability:null,
    warnings:['No station scheduling, commissioning, radio weather, detailed antenna masks or ground terrain modeled.',
      'NASA Horizons surface-target apparent geometry; station coordinate/altitude accuracy and light-time conventions are limiting assumptions.',
      'Station #3 is unavailable without a hypothetical representative coordinate; its absence reduces network coverage.',
      'LEGS RF margins are preliminary and use hypothetical spacecraft hardware; positive margin alone is not an operational link.',
      'Contact windows are approximated by linearly interpolating geometric/RF margins between sampled timestamps.']};
}
