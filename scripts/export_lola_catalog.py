#!/usr/bin/env python3
"""Bundle DEM-derived JSON horizon profiles into a small Next.js TypeScript module.

Example:
  python3 scripts/export_lola_catalog.py \
      --site south-pole-demo=data/lola/real_lola_profile.json
  python3 scripts/export_lola_catalog.py \
      --site south-pole-demo=data/lola/real_lola_profile.json \
      --site site-b=data/lola/site_b.json

The original GeoTIFF and any NaN metadata are NOT included. Never fabricate
missing terrain; all 360-degree profiles must be generated from a real DEM.
"""
from __future__ import annotations
import argparse
import json
import math
import re
from pathlib import Path

ALLOWED_META = (
    'siteElevationM', 'approxLocalSlopeDeg', 'terrainSearchRadiusKm',
    'radialSamplingMeters', 'azimuthSamplingDegrees',
    'footprintSurfaceAreaM2', 'footprintProjectedAreaM2', 'footprintRadiusM',
)

def load_profile(path: Path):
    # Python's JSON decoder accepts NaN by default; clean only metadata. Never
    # permit non-finite angles or site coordinates.
    doc = json.loads(path.read_text(encoding='utf-8'))
    p = doc.get('provenance')
    points = doc.get('points')
    if not isinstance(p, dict) or not isinstance(points, list) or len(points) < 12:
        raise ValueError(f'{path} lacks full points/provenance')
    for k in ('source', 'coordinateFrame', 'heightDatum'):
        if not isinstance(p.get(k), str) or not p[k].strip():
            raise ValueError(f'{path} missing {k}')
    for k in ('siteLatitudeDeg', 'siteLongitudeDeg', 'observerHeightM'):
        if type(p.get(k)) not in (int, float) or not math.isfinite(p[k]):
            raise ValueError(f'{path}: missing/nonfinite {k}')
    azimuths = []
    clean = []
    for item in points:
        a, h = item.get('azimuthDeg'), item.get('horizonElevationDeg')
        if type(a) not in (int, float) or type(h) not in (int, float) or not all(map(math.isfinite, (a,h))):
            raise ValueError(f'{path}: nonfinite horizon angle')
        if not (0 <= a < 360) or not (-90 <= h <= 90):
            raise ValueError(f'{path}: invalid terrain direction')
        clean.append({'azimuthDeg': a, 'horizonElevationDeg': h})
        azimuths.append(a)
    azimuths.sort()
    gaps = [(azimuths[(j+1)%len(azimuths)]-azimuths[j])%360 for j in range(len(azimuths))]
    if min(gaps) <= 1e-6 or max(gaps) > 30.00001:
        raise ValueError(f'{path}: duplicate azimuth or gap > 30 degrees')
    meta = doc.get('metadata', {})
    if not isinstance(meta, dict):
        meta = {}
    meta_out = {
        k: (v if isinstance((v := meta.get(k)), (int, float)) and math.isfinite(v) else None)
        for k in ALLOWED_META
    }
    return {'points': clean, 'provenance': p, 'metadata': meta_out}

def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--site', action='append', required=True, metavar='ID=JSON')
    parser.add_argument('--out', type=Path, default=Path('utils/generatedLolaCatalog.ts'))
    a = parser.parse_args()
    catalog = {}
    for pair in a.site:
        if '=' not in pair:
            parser.error('--site must be ID=path/to/profile.json')
        ident, path = pair.split('=', 1)
        if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', ident):
            parser.error(f'Invalid site ID: {ident!r}')
        if ident in catalog:
            parser.error(f'Duplicate site ID: {ident}')
        catalog[ident] = load_profile(Path(path))
    rendered = json.dumps(catalog, indent=2, ensure_ascii=True, allow_nan=False)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text("import type { HorizonProfile } from './terrainAnalysis';\n\n"
                     '// GENERATED from NASA LOLA profiles. Edit source JSON and rerun export_lola_catalog.py.\n'
                     f'export const generatedLolaCatalog: Record<string, HorizonProfile> = {rendered};\n',
                     encoding='utf-8')
    print(f'Prepared {len(catalog)} LOLA site(s) in {a.out} (size {a.out.stat().st_size:,} bytes)')

if __name__ == '__main__':
    run()
