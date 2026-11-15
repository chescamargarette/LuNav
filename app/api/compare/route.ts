import { GET as getHorizons } from '../horizons/route';
import { analyzeObservations, type HorizonsObservation, type HorizonProfile,
  type SpacecraftSpecs } from '../../../utils/terrainAnalysis';


type SiteRequest = { id: string; name?: string; lat: number; lon: number; horizonProfile?: HorizonProfile };
type MissionRequest = {
  sites: SiteRequest[];
  startUtc: string;
  endUtc: string;
  stepHours?: number;
  timezone?: string;
  terrainMode?: 'ideal_horizon' | 'terrain_aware';
  spacecraft?: SpacecraftSpecs;
};
const toDate = (value: string): Date => {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT00:00:00(?:\.000)?Z$/.test(value)) {
    throw new Error('Current Horizons adapter requires UTC midnight timestamps YYYY-MM-DDT00:00:00Z');
  }
  const d = new Date(value);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value.slice(0,10)) {
    throw new Error('Invalid UTC date');
  }
  return d;
};
function validate(x: MissionRequest) {
  if (!x || !Array.isArray(x.sites) || x.sites.length < 1 || x.sites.length > 4) {
    throw new Error('Choose between one and four sites');
  }
  if (x.terrainMode && !['ideal_horizon','terrain_aware'].includes(x.terrainMode)) throw new Error('Invalid terrainMode');
  if (x.timezone !== undefined && x.timezone !== 'UTC') throw new Error('MVP accepts UTC only; convert display times in the frontend');
  const start = toDate(x.startUtc), end = toDate(x.endUtc);
  const days = (end.getTime()-start.getTime())/86_400_000;
  if (days <= 0 || days > 31) throw new Error('Mission interval must be 1–31 days');
  const step = x.stepHours ?? 1;
  if (!Number.isInteger(step) || step < 1 || step > 24) throw new Error('stepHours must be an integer between 1 and 24');
  if (days*24/step + 1 > 800) throw new Error('Too many requested observations');
  const used = new Set<string>();
  for (const site of x.sites) {
    if (!site || typeof site.id !== 'string' || site.id.length < 1 || site.id.length > 64
        || used.has(site.id) || !Number.isFinite(site.lat) || !Number.isFinite(site.lon)
        || Math.abs(site.lat) > 90 || Math.abs(site.lon) > 180) {
      throw new Error('Invalid or duplicate site identification or coordinates');
    }
    used.add(site.id);
    if ((x.terrainMode ?? 'ideal_horizon') === 'terrain_aware' && !site.horizonProfile) {
      throw new Error(`Site ${site.id}: terrain-aware mode requires a measured/generated horizonProfile`);
    }
  }
  return {start, end, step};
}
async function retrieve(target: 'sun'|'earth', site: SiteRequest,
  start: Date, end: Date, step: number): Promise<HorizonsObservation[]> {
  const params = new URLSearchParams({ target, lat: String(site.lat), lon: String(site.lon),
    start: start.toISOString().slice(0,10), stop: end.toISOString().slice(0,10), step:String(step) });
  const url = `http://localhost/api/horizons?${params}`;
  // Call the already working Horizons handler directly, without a network roundtrip to Vercel.
  const response = await getHorizons(new Request(url));
  const result = await response.json();
  if (!response.ok) throw new Error(`Horizons ${target} failed for ${site.id}: ${String(result.error ?? response.status)}`);
  if (!Array.isArray(result.observations)) throw new Error(`Horizons ${target} did not return observations`);
  return result.observations as HorizonsObservation[];
}
export async function POST(request: Request) {
  try {
    const body = await request.text();
    if (body.length > 1_000_000) return Response.json({error:'Request too large'}, {status:413});
    let x: MissionRequest;
    try { x = JSON.parse(body) as MissionRequest; }
    catch { return Response.json({error:'Invalid JSON body'}, {status:400}); }
    let dates: ReturnType<typeof validate>;
    try { dates = validate(x); }
    catch (e) { return Response.json({error:String(e)}, {status:422}); }
    const sites = [];
    for (const site of x.sites) {
      const [sun, earth] = await Promise.all([
        retrieve('sun',site,dates.start,dates.end,dates.step),
        retrieve('earth',site,dates.start,dates.end,dates.step)
      ]);
      let analysis: ReturnType<typeof analyzeObservations>;
      try {
        analysis = analyzeObservations({ sun, earth, terrainMode:x.terrainMode ?? 'ideal_horizon',
          horizonProfile:site.horizonProfile, siteLatDeg:site.lat, siteLonDeg:site.lon,
          spacecraft:x.spacecraft, requestedStartUtc:dates.start.toISOString(),
          requestedEndUtc:dates.end.toISOString() });
      } catch (e) { return Response.json({error:`Site ${site.id}: ${String(e)}`}, {status:422}); }
      sites.push({ id:site.id, name:site.name ?? site.id, lat:site.lat, lon:site.lon, ...analysis });
    }
    return Response.json({ application:'LuNav', source:'NASA JPL Horizons',
      requestedStartUtc:dates.start.toISOString(), requestedEndUtc:dates.end.toISOString(),
      stepHours:dates.step, sites,
      warnings:['Compare site percentages only over the same fully covered time intervals. Terrain profiles are not fetched automatically.'] });
  } catch(e) {
    return Response.json({error:String(e)}, {status:502});
  }
}
