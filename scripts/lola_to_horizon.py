#!/usr/bin/env python3
"""Convert a local NASA GSFC PGDA south-polar LOLA LDEM GeoTIFF into LuNAv Mode 3 JSON.

Requires: numpy, rasterio, pyproj. No network requests are made by this script.
Heights are assumed to be metres above the 1,737,400-m lunar reference sphere.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path
from rasterio.windows import from_bounds

import numpy as np
import numpy.ma as ma
import rasterio
from pyproj import CRS, Transformer

RADIUS_M = 1_737_400.0
PRODUCT_URL = 'https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF'
LUNAR_LONLAT = CRS.from_proj4('+proj=longlat +a=1737400 +b=1737400 +no_defs +type=crs')


def destination(lat_deg: float, lon_deg: float, az_deg: np.ndarray, distance_m: np.ndarray):
    """Spherical great-circle destination, azimuth clockwise from lunar north."""
    phi1 = np.deg2rad(lat_deg)
    lon1 = np.deg2rad(lon_deg)
    a = np.deg2rad(az_deg)
    delta = distance_m / RADIUS_M
    sinphi2 = np.sin(phi1) * np.cos(delta) + np.cos(phi1) * np.sin(delta) * np.cos(a)
    phi2 = np.arcsin(np.clip(sinphi2, -1, 1))
    lam2 = lon1 + np.arctan2(np.sin(a) * np.sin(delta) * np.cos(phi1),
                            np.cos(delta) - np.sin(phi1) * np.sin(phi2))
    return np.rad2deg(phi2), (np.rad2deg(lam2) + 180) % 360 - 180


def as_valid_float(value, label):
    if ma.is_masked(value):
        raise ValueError(f'{label} falls outside the DEM or is NoData')
    value = float(value)
    if not math.isfinite(value):
        raise ValueError(f'{label} is not finite')
    return value


def generate(dem: Path, lat: float, lon: float, observer_m: float,
             max_km: float, step_m: float, az_step_deg: int = 1):
    if not (-90 < lat < -80):
        raise ValueError('This south-polar DEM workflow supports -90 < latitude < -80 degrees (not the exact pole).')
    if not (-180 <= lon <= 180):
        raise ValueError('Longitude must be in -180..180 east degrees')
    if observer_m < 0 or max_km <= 0 or step_m <= 0 or az_step_deg < 1 or 360 % az_step_deg:
        raise ValueError('Invalid height, search radius, distance step, or azimuth step')
    if not dem.exists():
        raise FileNotFoundError(f'DEM missing: {dem}')

    distances = np.arange(step_m, max_km * 1000, step_m, dtype=float)
    distances = np.append(distances, max_km * 1000)
    azimuths = np.arange(0, 360, az_step_deg, dtype=float)
    phi2, lam2 = destination(lat, lon, azimuths[:, None], distances[None, :])
    with rasterio.open(dem) as ds:
        if ds.crs is None:
            raise ValueError('GeoTIFF has no CRS. Do not assume an Earth projection: use a properly georeferenced NASA GeoTIFF.')
        # Protect against accidental use of an Earth DEM/CRS.
        crs_text = ds.crs.to_wkt().lower()
        if '1737400' not in crs_text and '1737400' not in ds.crs.to_proj4():
            raise ValueError('DEM CRS does not identify the 1,737,400-m lunar sphere; inspect the source metadata before processing.')
        if not ds.crs.is_projected:
            raise ValueError('Expected a south polar stereographic projected GeoTIFF')
        try:
            to_xy = Transformer.from_crs(LUNAR_LONLAT, ds.crs, always_xy=True)
        except Exception as e:
            raise ValueError(f'Cannot transform lunar geographic coordinates to DEM CRS: {e}') from e
        x0, y0 = to_xy.transform(lon, lat)
        z0 = as_valid_float(next(ds.sample([(x0, y0)], masked=True))[0], 'Observer elevation')
        if abs(z0) > 100_000:
            raise ValueError(f'Unexpected observer elevation {z0} m: check height scaling / datum in source.')
        xs, ys = to_xy.transform(lam2.ravel(), phi2.ravel())
        samples = ma.stack(list(ds.sample(zip(xs, ys), indexes=1, masked=True)))[:, 0]
        if samples.size != xs.size:
            raise RuntimeError('DEM did not return every requested sample')
        invalid = ma.getmaskarray(samples) | ~np.isfinite(np.asarray(samples.filled(np.nan), dtype=float))
        n_invalid = int(invalid.sum())
        if n_invalid:
            raise ValueError(f'{n_invalid} terrain samples are NoData / outside DEM (of {len(xs)}). '
                             'Reduce --radius-km, change site, or obtain a DEM with complete coverage. '
                             'Missing terrain cannot be assumed unobstructed.')
        z = np.asarray(samples, dtype=float).reshape(phi2.shape)
        if np.any(np.abs(z) > 100_000):
            raise ValueError('DEM contains implausible elevation magnitudes: check height scaling and NoData.')
        # Approximate local slope from four neighboring DEM samples in the map projection.
        rx = abs(ds.transform.a)
        ry = abs(ds.transform.e)
        neighbors = ma.stack(list(ds.sample([
            (x0-rx,y0), (x0+rx,y0), (x0,y0-ry), (x0,y0+ry)
        ], indexes=1, masked=True)))[:, 0]
        slope = None
        if not ma.getmaskarray(neighbors).any():
            vals = np.asarray(neighbors, dtype=float)
            dzdx = (vals[1]-vals[0])/(2*rx)
            dzdy = (vals[3]-vals[2])/(2*ry)
            slope = float(np.rad2deg(np.arctan(np.hypot(dzdx, dzdy))))
        crs_wkt = ds.crs.to_wkt()
        pixel_size = [rx, ry]
        nodata = ds.nodata
        # Approximate DEM-based surface area inside a configurable projected
        # circular footprint; this is not solar-panel area or landing safety.
        footprint_radius_m = 500.0
        window = from_bounds(x0-footprint_radius_m, y0-footprint_radius_m,
                             x0+footprint_radius_m, y0+footprint_radius_m,
                             ds.transform).round_offsets().round_lengths()
        footprint = ds.read(1, window=window, boundless=True, masked=True)
        values = np.asarray(ma.filled(footprint.astype(float), np.nan), dtype=float)
        local_transform = ds.window_transform(window)
        rr, cc = np.indices(values.shape)
        xx = local_transform.c + local_transform.a*(cc+0.5)
        yy = local_transform.f + local_transform.e*(rr+0.5)
        inside = (xx-x0)**2 + (yy-y0)**2 <= footprint_radius_m**2
        projected_area = float(inside.sum()*rx*ry) if np.any(inside) else None
        surface_area = None
        if np.any(inside) and np.all(np.isfinite(values[inside])):
            dzdy, dzdx = np.gradient(values, ry, rx)
            slope_factors = np.hypot(dzdx, dzdy)
            if np.all(np.isfinite(slope_factors[inside])):
                surface_area = float(np.sum(np.sqrt(1+slope_factors[inside]**2)*rx*ry))

    phi1 = np.deg2rad(lat)
    lam1 = np.deg2rad(lon)
    phi = np.deg2rad(phi2)
    lam = np.deg2rad(lam2)
    ct = np.cos(phi)
    rt = RADIUS_M + z
    r0 = RADIUS_M + z0 + observer_m
    # Observer-centered East-North-Up projection, equations 11-17 of the supplied model.
    qx = rt * ct * np.cos(lam) - r0 * np.cos(phi1) * np.cos(lam1)
    qy = rt * ct * np.sin(lam) - r0 * np.cos(phi1) * np.sin(lam1)
    qz = rt * np.sin(phi) - r0 * np.sin(phi1)
    east = -np.sin(lam1) * qx + np.cos(lam1) * qy
    north = -np.sin(phi1)*np.cos(lam1)*qx - np.sin(phi1)*np.sin(lam1)*qy + np.cos(phi1)*qz
    up = np.cos(phi1)*np.cos(lam1)*qx + np.cos(phi1)*np.sin(lam1)*qy + np.sin(phi1)*qz
    apparent = np.rad2deg(np.arctan2(up, np.hypot(east, north)))
    horizon = np.max(apparent, axis=1)
    # Additional top-level metadata is informational; current /api/compare ignores it.
    result = {
        'points': [
            {'azimuthDeg': float(a), 'horizonElevationDeg': round(float(h), 6)}
            for a, h in zip(azimuths, horizon)
        ],
        'provenance': {
            'source': f'NASA GSFC PGDA LOLA LDEM: {dem.name}',
            'sourceUrl': PRODUCT_URL if dem.name.lower() == 'ldem_80s_80mpp_adj.tif' else 'https://pgda.gsfc.nasa.gov/products/90',
            'coordinateFrame': 'MOON_ME / DE421 south-polar stereographic (as documented by NASA); transformed to lunar planetocentric latitude and east longitude',
            'heightDatum': 'Height in metres above lunar reference sphere R=1737400 m (verify against product documentation)',
            'observerHeightM': float(observer_m),
            'siteLatitudeDeg': float(lat),
            'siteLongitudeDeg': float(lon),
            'method': f'LOLA DEM spherical ENU ray-sampled max terrain horizon; {az_step_deg}deg azimuth bins; {step_m:g}m radial step; {max_km:g}km radius; nearest-pixel sampling; full radial coverage enforced',
        },
        'metadata': {
            'siteElevationM': round(z0,3),
            'approxLocalSlopeDeg': round(slope,3) if slope is not None else None,
            'terrainSearchRadiusKm': float(max_km),
            'radialSamplingMeters': float(step_m),
            'azimuthSamplingDegrees': int(az_step_deg),
            'geoTiffCRS': crs_wkt,
            'pixelSizeMeters': pixel_size,
            'noDataValue': (nodata if nodata is not None and math.isfinite(nodata) else None),
            'footprintSurfaceAreaM2': round(surface_area, 1) if surface_area is not None else None,
            'footprintProjectedAreaM2': round(projected_area, 1) if projected_area is not None else None,
            'footprintRadiusM': footprint_radius_m,
            'note': 'Site height / slope metadata are informational: the current LuNAv API only consumes points and provenance.'
        }
    }
    return result


def main():
    p = argparse.ArgumentParser(description='Generate genuine NASA LOLA-derived LuNAv Mode 3 horizon JSON')
    p.add_argument('--dem', required=True, type=Path, help='Local NASA PGDA lunar GeoTIFF')
    p.add_argument('--lat', type=float, required=True, help='Planetocentric latitude in degrees')
    p.add_argument('--lon', type=float, required=True, help='East longitude in degrees')
    p.add_argument('--observer-m', type=float, default=1, help='Observer height above local ground')
    p.add_argument('--radius-km', type=float, default=30, help='Maximum radial terrain range (not a guaranteed true horizon)')
    p.add_argument('--step-m', type=float, default=80, help='Sample interval along each ray (meters)')
    p.add_argument('--az-step-deg', type=int, default=1, help='Azimuth sample spacing, integer divisor of 360')
    p.add_argument('--out', type=Path, required=True, help='Output JSON for LuNAv Mode 3')
    a = p.parse_args()
    result = generate(a.dem, a.lat, a.lon, a.observer_m, a.radius_km, a.step_m, a.az_step_deg)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(result, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    print(f'Wrote {len(result["points"])} directional horizon samples to: {a.out}')
    print(f'Observer elevation: {result["metadata"]["siteElevationM"]} m')
    print(f'Approximate local slope: {result["metadata"]["approxLocalSlopeDeg"]}°')
    print(f'Skyline min/max: {min(p["horizonElevationDeg"] for p in result["points"]):.3f}° / {max(p["horizonElevationDeg"] for p in result["points"]):.3f}°')
    print('Paste the entire JSON into /dev/horizons -> Paste real horizon profile.')
    print('Note: horizon covers only the specified radius, not an indefinitely long skyline.')

if __name__ == '__main__':
    main()
