/** Mission-time adapter: explicit timezone offsets, bounded hourly ephemeris, conservative interpolation. */
import {parseHorizonsUtc, wrap360, type HorizonsObservation} from './terrainAnalysis';
const HOUR=3600000;
const DAY=86400000;
export function parseInstant(value:string):Date {
  if(typeof value!=='string'|| !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/i.test(value))
    throw new Error('Use an ISO 8601 date-time with explicit timezone, e.g. 2026-12-10T10:30:00+08:00');
  const ms=Date.parse(value);
  if(!Number.isFinite(ms))throw new Error('Invalid date-time');
  return new Date(ms);
}
export function timePlan(startInput:string,endInput:string,stepHours=1,timezone='UTC') {
  const start=parseInstant(startInput), end=parseInstant(endInput);
  const range=end.getTime()-start.getTime();
  if(range<=0||range>31*DAY)throw new Error('Mission period must be greater than zero and at most 31 days');
  if(!Number.isFinite(stepHours)||stepHours<0.25||stepHours>24)throw new Error('stepHours must be between 0.25 and 24');
  if(typeof timezone!=='string'||timezone.length>70)throw new Error('Invalid display timezone');
  try{new Intl.DateTimeFormat('en-US',{timeZone:timezone}).format(start);}catch{throw new Error('Unknown IANA display timezone');}
  const obs:number[]=[start.getTime()];
  const increment=stepHours*HOUR;
  while(obs[obs.length-1]+increment < end.getTime()-1){
    obs.push(obs[obs.length-1]+increment);
    if(obs.length>800)throw new Error('Too many time samples; use a larger stepHours');
  }
  obs.push(end.getTime());
  if(obs.length>800)throw new Error('Too many time samples; use a larger stepHours');
  const baseStartMs=Math.floor(start.getTime()/DAY)*DAY;
  const baseEndMs=Math.ceil(end.getTime()/DAY)*DAY;
  // An exact midnight endpoint must remain included in the Horizons stop time.
  return {start,end,timezone,stepHours, times:obs,
    ephemerisStart:new Date(baseStartMs),ephemerisEnd:new Date(baseEndMs),
    method:'Hourly NASA JPL Horizons rows; sub-hour and non-hour endpoints linearly interpolated (approximate)' as const};
}
export function resampleAngles(observations:HorizonsObservation[], times:number[]):HorizonsObservation[] {
  if(!Array.isArray(observations)||observations.length<2)throw new Error('Insufficient Horizons observations');
  const sorted=observations.map(o=>({...o,ms:parseHorizonsUtc(o.time)})).sort((a,b)=>a.ms-b.ms);
  for(let i=1;i<sorted.length;i++)if(sorted[i].ms<=sorted[i-1].ms)throw new Error('Duplicate Horizons timestamps');
  return times.map(t=>{
    let left=0,right=sorted.length-1;
    while(left<right){const mid=(left+right)>>1;if(sorted[mid].ms<t)left=mid+1;else right=mid;}
    const upper=sorted[left];
    if(upper.ms===t)return {time:toHorizonsTime(t),azimuthDeg:upper.azimuthDeg,elevationDeg:upper.elevationDeg};
    const a=sorted[left-1];
    if(!a||!upper||t<a.ms||t>upper.ms)throw new Error('Horizons does not cover requested exact time');
    if(upper.ms-a.ms>1.01*HOUR)throw new Error('Horizons gap exceeds one hour');
    const f=(t-a.ms)/(upper.ms-a.ms);
    const angleDiff=wrap360(upper.azimuthDeg-a.azimuthDeg+180)-180;
    return {time:toHorizonsTime(t),azimuthDeg:wrap360(a.azimuthDeg+f*angleDiff),
      elevationDeg:a.elevationDeg+f*(upper.elevationDeg-a.elevationDeg)};
  });
}
const mons=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function toHorizonsTime(t:number) {
  const d=new Date(t); return `A.D. ${d.getUTCFullYear()}-${mons[d.getUTCMonth()]}-${String(d.getUTCDate()).padStart(2,'0')} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}:${String(d.getUTCSeconds()).padStart(2,'0')}`;
}
