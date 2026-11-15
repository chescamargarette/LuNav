/**
 * Implements equations 11–17 in the supplied mathematical model.
 * Input is geolocated terrain samples, NOT georeferenced DEM pixels.
 * Convert LOLA GeoTIFF positions to lunar geographic lat/lon before using this.
 * All heights must be above the SAME spherical lunar datum.
 */
import { type HorizonPoint, type HorizonProfile, wrap360 } from './terrainAnalysis';
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
export const MOON_REFERENCE_RADIUS_M = 1_737_400;
export type TerrainSample = { latDeg:number; lonDeg:number; elevationM:number };
export type ObserverSite = { latDeg:number; lonDeg:number; elevationM:number; observerHeightM:number };

function unit(latDeg:number,lonDeg:number) {
  const p=latDeg*D2R, l=lonDeg*D2R;
  return [Math.cos(p)*Math.cos(l), Math.cos(p)*Math.sin(l), Math.sin(p)] as const;
}
const dot=(a:readonly number[],b:readonly number[])=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function terrainApparentDirection(site:ObserverSite, point:TerrainSample, referenceRadiusM=MOON_REFERENCE_RADIUS_M) {
  for (const x of [site.latDeg,site.lonDeg,site.elevationM,site.observerHeightM,
    point.latDeg,point.lonDeg,point.elevationM,referenceRadiusM]) {
    if (!Number.isFinite(x)) throw new Error('Non-finite terrain geometry input');
  }
  if (referenceRadiusM <= 0 || site.observerHeightM < 0 || Math.abs(site.latDeg)>90 || Math.abs(point.latDeg)>90) {
    throw new Error('Invalid spherical lunar geometry');
  }
  if (Math.abs(site.latDeg)===90) throw new Error('Exact-pole azimuth needs a defined polar-reference convention');
  const p=site.latDeg*D2R, l=site.lonDeg*D2R;
  const up=unit(site.latDeg,site.lonDeg);
  const east=[-Math.sin(l),Math.cos(l),0];
  const north=[-Math.sin(p)*Math.cos(l),-Math.sin(p)*Math.sin(l),Math.cos(p)];
  const other=unit(point.latDeg,point.lonDeg);
  const r0=referenceRadiusM+site.elevationM+site.observerHeightM;
  const ri=referenceRadiusM+point.elevationM;
  const q=[ri*other[0]-r0*up[0],ri*other[1]-r0*up[1],ri*other[2]-r0*up[2]];
  const E=dot(q,east),N=dot(q,north),U=dot(q,up);
  const horizontalDistanceM=Math.hypot(E,N);
  if (horizontalDistanceM < 0.001) return null;
  return { azimuthDeg:wrap360(Math.atan2(E,N)*R2D),
    horizonElevationDeg: Math.atan2(U,horizontalDistanceM)*R2D,
    horizontalDistanceM };
}
/** Builds a skyline from radial terrain samples. Bins without coverage are omitted, not filled. */
export function horizonProfileFromTerrainSamples(args:{
  site:ObserverSite; samples:TerrainSample[]; binWidthDeg?:number;
  source:string; sourceUrl?:string; coordinateFrame:string; heightDatum:string;
  referenceRadiusM?:number;
}):HorizonProfile {
  const {site,samples,source,sourceUrl,coordinateFrame,heightDatum}=args;
  const width=args.binWidthDeg??1;
  if (!Number.isInteger(360/width) || width<=0 || width>10) throw new Error('binWidthDeg must divide 360, at most 10 degrees');
  if (!source?.trim() || !coordinateFrame?.trim() || !heightDatum?.trim()) throw new Error('Missing terrain sample provenance');
  if (!Array.isArray(samples) || samples.length===0) throw new Error('No terrain samples');
  const bins=new Map<number,number>();
  for (const sample of samples) {
    const direction=terrainApparentDirection(site,sample,args.referenceRadiusM);
    if (!direction) continue;
    const i=Math.floor(direction.azimuthDeg/width);
    bins.set(i,Math.max(bins.get(i)??-Infinity,direction.horizonElevationDeg));
  }
  const points:HorizonPoint[]=[...bins.entries()].sort((a,b)=>a[0]-b[0])
    .map(([i,h])=>({azimuthDeg: (i+0.5)*width,horizonElevationDeg:h}));
  return {points,provenance:{source,sourceUrl,coordinateFrame,heightDatum,
    observerHeightM:site.observerHeightM,siteLatitudeDeg:site.latDeg,siteLongitudeDeg:site.lonDeg,
    method:`spherical ENU max-elevation skyline, ${width}deg bins; source terrain points`}};
}
