import { getLolaSites } from '../../../../utils/lolaCatalog';

export async function GET() {
  const sites = getLolaSites();
  return Response.json({ source: 'NASA LOLA precomputed, site-specific terrain profiles', sites,
    count: sites.length, coverage: 'Only listed candidate locations have automatically available profiles',
    warning: 'Profiles are sampled to a finite radius. Additional geographic locations require preprocessing from the local LOLA GeoTIFF.' });
}
