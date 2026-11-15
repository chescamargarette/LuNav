"""Deterministic synthetic *raster* test; does NOT verify NASA science data."""
from pathlib import Path
import sys
import tempfile
import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.crs import CRS
from pyproj import Transformer
sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
from lola_to_horizon import generate, destination, LUNAR_LONLAT

def test():
    crs = CRS.from_proj4('+proj=stere +lat_0=-90 +lat_ts=-90 +lon_0=0 +a=1737400 +b=1737400 +units=m +no_defs')
    tr = Transformer.from_crs(LUNAR_LONLAT, crs, always_xy=True)
    sx, sy = tr.transform(0.0, -89.5)
    pixel = 80.0
    n = 300
    affine = from_origin(sx-150*pixel, sy+150*pixel, pixel, pixel)
    data = np.full((n,n), -1000.0, dtype=np.float32)
    ridge_lat, ridge_lon = destination(-89.5, 0., np.array([0.]), np.array([2000.]))
    rx, ry = tr.transform(float(ridge_lon[0]),float(ridge_lat[0]))
    for row in range(n):
        for col in range(n):
            px, py = affine * (col+.5,row+.5)
            if (px-rx)**2 + (py-ry)**2 < 320.0**2:
                data[row,col] = -800.0
    with tempfile.TemporaryDirectory() as td:
        path = Path(td)/'test_lunar.tif'
        with rasterio.open(path,'w',driver='GTiff',width=n,height=n,count=1,dtype='float32',crs=crs,transform=affine,nodata=-999999.) as dst:
            dst.write(data,1)
        result = generate(path,-89.5,0.,1.0,5.0,80.0,1)
        pts = result['points']
        assert len(pts)==360
        assert result['metadata']['siteElevationM'] == -1000.0
        assert result['metadata']['footprintSurfaceAreaM2'] is not None
        assert result['metadata']['footprintProjectedAreaM2'] is not None
        assert result['metadata']['footprintSurfaceAreaM2'] >= result['metadata']['footprintProjectedAreaM2']
        assert pts[0]['horizonElevationDeg'] > 3.0, pts[0]
        assert pts[180]['horizonElevationDeg'] < 0, pts[180]
        assert result['provenance']['siteLatitudeDeg'] == -89.5
    print('PASS: 360 azimuths, signed visibility skyline, real lunar CRS transformation, metadata and provenance')

if __name__ == '__main__': test()
