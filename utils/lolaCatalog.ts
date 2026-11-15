/** Deployment-safe catalog of precomputed, geolocated NASA LOLA horizon profiles.
 * The 180 MB source GeoTIFF is NOT deployed; generatedLolaCatalog.ts contains
 * small, static profiles bundled by Next.js at build time.
 */
import { generatedLolaCatalog } from './generatedLolaCatalog';
import type { HorizonProfile } from './terrainAnalysis';

const near = (a: number, b: number) => Math.abs(a - b) <= 0.0001;
const lonDelta = (a: number, b: number) => (((a - b + 180) % 360) + 360) % 360 - 180;
export function siteMatches(profile: HorizonProfile, lat: number, lon: number): boolean {
  const p = profile.provenance;
  return near(p.siteLatitudeDeg, lat) && near(lonDelta(p.siteLongitudeDeg, lon), 0);
}
export function resolveLolaProfile(siteId: string, lat: number, lon: number): { id: string; profile: HorizonProfile } | null {
  const exact = generatedLolaCatalog[siteId];
  if (exact) {
    if (!siteMatches(exact, lat, lon)) throw new Error(`Catalog site ${siteId} coordinates do not match the request`);
    return {id: siteId, profile: exact};
  }
  // Match by coordinate as a convenience for frontend-created site IDs.
  const found = Object.entries(generatedLolaCatalog).find(([, p]) => siteMatches(p, lat, lon));
  return found ? {id: found[0], profile: found[1]} : null;
}
export function getLolaSites() {
  return Object.entries(generatedLolaCatalog).map(([id,p]) => ({
    id, lat: p.provenance.siteLatitudeDeg, lon: p.provenance.siteLongitudeDeg,
    siteElevationM: p.metadata?.siteElevationM ?? null,
    slopeDeg: p.metadata?.approxLocalSlopeDeg ?? null,
    horizonRadiusKm: p.metadata?.terrainSearchRadiusKm ?? null,
    footprintSurfaceAreaM2: p.metadata?.footprintSurfaceAreaM2 ?? null,
    source: p.provenance.source, sourceUrl: p.provenance.sourceUrl ?? null,
    pointCount: p.points.length,
  }));
}
