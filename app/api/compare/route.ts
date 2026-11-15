/** Backwards-compatible Phase 3B mission-analysis route. Does not modify the main frontend. */
import { GET as getHorizons } from '../horizons/route';
import { resolveLolaProfile, getLolaSites } from '../../../utils/lolaCatalog';
import { MISSION_REFERENCES, nominalTerrainCoverage } from '../../../utils/missionReferences';
import {analyzeObservations, type HorizonsObservation, type HorizonProfile,
  type SpacecraftSpecs} from '../../../utils/terrainAnalysis';
import {timePlan, resampleAngles} from '../../../utils/missionTime';
import {batteryTimeline, legsCandidateTimeline, type LegsScenario} from '../../../utils/missionDynamics';
import {legsStationNetworkAnalysis} from '../../../utils/legsGeometry';

type SiteRequest={id:string;name?:string;lat:number;lon:number;horizonProfile?:HorizonProfile};
type MissionRequest={
  sites?:SiteRequest[];
  missionReferenceId?:string;
  startUtc:string;endUtc:string;stepHours?:number;timezone?:string;
  terrainMode?:'ideal_horizon'|'terrain_aware';
  spacecraft?:SpacecraftSpecs;
  legsScenario?:LegsScenario;
};
function chosenSites(req:MissionRequest){
  const ref=req.missionReferenceId?MISSION_REFERENCES.find(x=>x.id===req.missionReferenceId):null;
  if(req.missionReferenceId&&!ref)throw new Error('Unknown historical mission ID');
  const sites=(req.sites?.length?req.sites:ref?[{id:ref.id,name:ref.label,lat:ref.latDeg,lon:ref.lonDegEast}]:[]) as SiteRequest[];
  if(sites.length<1||sites.length>4)throw new Error('Choose between one and four sites');
  if(ref&&(sites.length!==1||Math.abs(sites[0].lat-ref.latDeg)>0.0001||
      Math.abs(sites[0].lon-ref.lonDegEast)>0.0001))
    throw new Error('Mission preset coordinates do not match provided site. Clear missionReferenceId when customizing a landing site.');
  const ids=new Set<string>();
  for(const site of sites){
    if(!site||typeof site.id!=='string'||site.id.length<1||site.id.length>64||ids.has(site.id)||
       typeof site.lat!=='number'||!Number.isFinite(site.lat)||site.lat < -90||site.lat > 90||
       typeof site.lon!=='number'||!Number.isFinite(site.lon)||site.lon < -180||site.lon>180)
      throw new Error('Invalid or duplicate site ID or latitude/longitude');
    ids.add(site.id);
  }
  return {sites,ref};
}
async function retrieve(target:'sun'|'earth',site:SiteRequest,start:Date,end:Date) {
  const params=new URLSearchParams({target,lat:String(site.lat),lon:String(site.lon),
    start:start.toISOString().slice(0,10),stop:end.toISOString().slice(0,10),step:'1'});
  const response=await getHorizons(new Request(`http://localhost/api/horizons?${params}`));
  const result=await response.json();
  if(!response.ok)throw new Error(`Horizons ${target} for ${site.id}: ${String(result.error??response.status)}`);
  if(!Array.isArray(result.observations))throw new Error(`Horizons ${target} did not return observations`);
  return result.observations as HorizonsObservation[];
}
export async function POST(request:Request){
  try {
    const raw=await request.text();
    if(raw.length>1_000_000)return Response.json({error:'Request too large'}, {status:413});
    let x:MissionRequest;
    try{x=JSON.parse(raw) as MissionRequest;}catch{return Response.json({error:'Invalid JSON body'}, {status:400});}
    let plan:ReturnType<typeof timePlan>,selection:ReturnType<typeof chosenSites>;
    try{
      if(!x||!['ideal_horizon','terrain_aware',undefined].includes(x.terrainMode))throw new Error('Invalid terrainMode');
      plan=timePlan(x.startUtc,x.endUtc,x.stepHours??1,x.timezone??'UTC');
      selection=chosenSites(x);
      if(x.legsScenario&&selection.ref?.published.communicationArchitecture==='rover_to_lander_to_earth')
        throw new Error('Historical Chandrayaan-3 rover used a lander relay. Disable the LEGS direct scenario or clear the historical preset for hypothetical redesign.');
    }catch(e){return Response.json({error:String(e)}, {status:422});}
    const sites=[];
    for(const site of selection.sites){
      let profile=site.horizonProfile;
      let catalogId:string|null=null;
      if((x.terrainMode??'ideal_horizon')==='terrain_aware'&&!profile){
        try{
          const cached=resolveLolaProfile(site.id,site.lat,site.lon);
          if(!cached){return Response.json({error:`Site ${site.id}: no precomputed LOLA profile. Available IDs: ${getLolaSites().map(p=>p.id).join(', ')||'none'}.`,code:'LOLA_SITE_NOT_CACHED',terrainCoverage:nominalTerrainCoverage(site.lat)}, {status:422});}
          profile=cached.profile;catalogId=cached.id;
        }catch(e){return Response.json({error:String(e)}, {status:422});}
      }
      const [sunRaw,earthRaw]=await Promise.all([
        retrieve('sun',site,plan.ephemerisStart,plan.ephemerisEnd),
        retrieve('earth',site,plan.ephemerisStart,plan.ephemerisEnd)]);
      let analysis:ReturnType<typeof analyzeObservations>;
      try{
        const sun=resampleAngles(sunRaw,plan.times),earth=resampleAngles(earthRaw,plan.times);
        analysis=analyzeObservations({sun,earth,terrainMode:x.terrainMode??'ideal_horizon',
          horizonProfile:profile,siteLatDeg:site.lat,siteLonDeg:site.lon,spacecraft:x.spacecraft,
          requestedStartUtc:plan.start.toISOString(),requestedEndUtc:plan.end.toISOString()});
      }catch(e){return Response.json({error:`Site ${site.id}: ${String(e)}`}, {status:422});}
      let power,legs,legsNetworkAnalysis=null;
      try{
        power=batteryTimeline(analysis.timeline,x.spacecraft??{});
        legs=x.legsScenario?legsCandidateTimeline(analysis.timeline,x.legsScenario):null;
        if(x.legsScenario?.geometry?.enabled){
          legsNetworkAnalysis=await legsStationNetworkAnalysis({lat:site.lat,lon:site.lon,profile,
            ideal:(x.terrainMode??'ideal_horizon')==='ideal_horizon',
            timesMs:plan.times,scenario:x.legsScenario,geometry:x.legsScenario.geometry});
        }
      }catch(e){return Response.json({error:`Mission models for ${site.id}: ${String(e)}`}, {status:422});}
      sites.push({id:site.id,name:site.name??site.id,lat:site.lat,lon:site.lon,
        terrainCatalogId:catalogId,...analysis,energySimulation:power,legsAnalysis:legs,legsNetworkAnalysis,
        assumptions:{...analysis.assumptions,dataQuality:catalogId
          ?'NASA LOLA DEM-derived precomputed catalog; independent geometry validation pending'
          :analysis.assumptions.dataQuality}});
    }
    const ref=selection.ref;
    return Response.json({application:'LuNav',apiVersion:'3c-geometry-preview',source:'NASA JPL Horizons',
      requestedStartUtc:plan.start.toISOString(),requestedEndUtc:plan.end.toISOString(),
      displayTimezone:plan.timezone,stepHours:plan.stepHours,
      ephemerisSamplingMethod:plan.method,missionReference:ref?{
        id:ref.id,label:ref.label,landingDateUtc:ref.landingDateUtc,
        published:ref.published,warnings:ref.warnings,sourceUrls:ref.sourceUrls,
        note:'Spacecraft parameters in this analysis are user inputs, not automatically verified historical specifications.'}:null,
      sites,
      warnings:['Terrain is loaded from precomputed geolocated profiles, not GeoTIFFs on the deployed server.',
        'NASA ephemeris samples are retrieved at one-hour cadence; finer steps and off-hour times are linearly interpolated approximations.',
        'Legacy legsAnalysis uses assumed range; legsNetworkAnalysis uses actual JPL Horizons station-specific slant range and predicted geometry when enabled.',
        'Unknown historical spacecraft values remain unknown; spacecraft inputs are user assumptions.']});
  }catch(e){return Response.json({error:e instanceof Error?e.message:String(e)}, {status:502});}
}
