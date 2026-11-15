# LuNav Backend Add-on — NASA Space Apps 2026

This **additive, non-destructive** implementation extends the existing NASA JPL Horizons backend without modifying the current frontend or overwriting `GET /api/analyze`.

## Important scope

- Real NASA Horizons Sun/Earth azimuth and elevation are retrieved by calling your **existing** `app/api/horizons/route.ts` handler.
- `terrain_aware` works **only if the request provides a real, geolocated and documented horizon profile**. The mathematical-model PDF describes how to compute such a profile, but is not itself a terrain dataset. No LOLA GeoTIFF was provided.
- `ideal_horizon` assumes H(A)=0 deg and is explicitly labeled idealized.
- Visibility percentages and blackout durations are duration-weighted. Zero-clearance times are linearly interpolated between samples; this approximation cannot detect obscurations that occur and end within one sample interval.
- Solar irradiance uses 1361 W/m2 at 1 AU, not a live Sun-distance correction. Solar panel power requires **panel area AND efficiency**.
- RF margin requires radio frequency, EIRP, receiver gain, receiver sensitivity and an **assumed Earth slant range**. This is *not* a verified flight link budget or a NASA-measured slant range.
- Terrain elevation, slope and footprint surface area remain `null` until real LOLA/DEM samples are integrated.
- Current backend's Horizons API only accepts date-only UTC boundaries. Therefore, this add-on accepts UTC midnight start/end timestamps; future exact-time/timezone support requires upgrading the Horizons adapter.

## Files to copy

Copy from this archive into the root of your existing LuNav repository:

```
app/api/compare/route.ts         # NEW: POST /api/compare
utils/terrainAnalysis.ts        # NEW: core visibility, solar, RF, timeline analysis
utils/horizonFromPoints.ts      # NEW: ENU/spherical skyline math for DEM-derived geographic terrain points
tests/terrainAnalysis.test.ts   # OPTIONAL: basic deterministic tests
tsconfig.test.json             # OPTIONAL: test compilation configuration
```

**Never overwrite** `app/api/horizons/route.ts`, `app/api/analyze/route.ts`, `utils/lunarEphemeris.ts`, or `app/page.tsx` with these files.

Check the actual integration branch before changing anything:

```
cd /Users/chesca/Developer/lunav
git status
git switch feature/integration
```

If `git status` reports uncommitted work, preserve or commit it before switching branches. If the branch has already been checked out, there is no need to switch.

## Local test command

From the LuNav repo root after copying the new files:

```
npm run build
npm run dev
```

Terminal in the present archive (no external dependencies needed):

```
tsc --project tsconfig.test.json
node .test-build/tests/terrainAnalysis.test.js
```

These tests use synthetic data, **not actual lunar ephemerides**. The compare route was separately smoke-tested with a mocked Horizons handler. It has not yet been tested against a live NASA response or your local merged frontend.

## Test request (ideal horizon)

This is a realistic *request configuration*, not expected results:

```
curl -sS http://localhost:3000/api/compare \
  -H 'Content-Type: application/json' \
  -d '{
    "sites": [{"id":"south-pole-demo","name":"South polar candidate","lat":-89.5,"lon":0}],
    "startUtc":"2027-01-11T00:00:00Z",
    "endUtc":"2027-01-15T00:00:00Z",
    "timezone":"UTC",
    "stepHours":1,
    "terrainMode":"ideal_horizon",
    "spacecraft":{
      "solarPanelAreaM2":2,
      "solarPanelEfficiency":0.25,
      "panelTiltDeg":80,
      "panelFacingAzimuthDeg":180,
      "minSolarPowerW":20,
      "maxDarknessHours":24,
      "maxEarthBlackoutHours":24
    }
  }'
```

`sites[].timeline[]` contains all timestamped Sun/Earth azimuths, elevations, horizon angles, clearances, visibility flags, direct irradiance, panel power and (when supplied) RF link margin. `sites[].availability` contains evaluated/requested hours, availability percentages, visible/unavailable hours, longest blackout lengths, and overlapping Sun/Earth hours. `sites[].segments[]` contains time subdivisions where interpolated visibility stays constant.

If the Earth slant range and complete RF inputs are not supplied, RF margin will be `null` as intended.

## Terrain-aware request format

Your teammate should supply an **actual horizon profile for the selected site** (derived from LOLA DEMs or a verified terrain product), with one value per direction, e.g. 1-degree azimuth resolution.

```
{
  "terrainMode": "terrain_aware",
  "sites": [{
    "id": "site-1",
    "lat": -89.5,
    "lon": 0,
    "horizonProfile": {
      "points": [
        {"azimuthDeg":0,"horizonElevationDeg":0.8},
        {"azimuthDeg":10,"horizonElevationDeg":1.1},
        "... CONTINUE WITH FULL 360-DEGREE COVERAGE ..."
      ],
      "provenance": {
        "source": "Verified NASA LOLA DEM product name and revision",
        "sourceUrl": "https://pgda.gsfc.nasa.gov/products/78",
        "coordinateFrame": "MOON_ME (verify match with Horizons output)",
        "heightDatum": "Spherical lunar reference radius 1737400 m",
        "observerHeightM": 1,
        "siteLatitudeDeg": -89.5,
        "siteLongitudeDeg": 0,
        "method": "ENU spherical skyline from LOLA DEM elevations"
      }
    }
  }],
  "startUtc": "2027-01-11T00:00:00Z",
  "endUtc": "2027-01-15T00:00:00Z"
}
```

This excerpt is **schematic** and contains no measured values. A real profile must be a complete numeric array; omitted sectors or large azimuth gaps (>30 deg) are rejected. Missing terrain must never be filled in with made-up zero angles.

In the terrain model's equations 11–17, `horizonFromPoints.ts` implements the 3D spherical observer-local east/north/up calculation. Its `horizonProfileFromTerrainSamples()` expects already geolocated pixel samples: `{latDeg,lonDeg,elevationM}` from a DEM, all on the same lunar reference datum. It does not read GeoTIFF files. A separate NASA LOLA GeoTIFF loader and proper Moon cartographic CRS transformation are still required.

## Critical validation before the demo

1. Verify the actual local `feature/integration` branch matches the GitHub-published backend API and that the existing Horizons route still returns `observations[{time,azimuthDeg,elevationDeg}]`.
2. Run `npm run build` in the real LuNav checkout, then run the example request using a live NASA connection.
3. Choose a site and time window containing an **actual horizon transition**; inspect raw timestamp and angle arrays.
4. Validate the Moon body-fixed frame, east-positive longitude and azimuth origin/direction, especially near the poles.
5. If using real terrain, verify site coordinates, observer height, lunar radius/height datum, DEM no-data and interpolation uncertainty.
6. Confirm the frontend is consuming the POST /api/compare result. The UI integration is **not** included in this add-on, to avoid overwriting your teammate's changes.
7. Never describe synthetic tests, illustrative spacecraft assumptions or ideal-horizon availability as a validated LOLA result.

## Data quality and known limitations

This backend estimates time-weighted availability over the **evaluated** interval. If Horizons returns less than the full requested range, it gives a `coveragePercent` and unevaluated duration; it does not extrapolate unknown tail intervals. Future improvements: automatic DEM retrieval and preprocessing, full disk visibility, derived Sun/Earth range, exact non-midnight time inputs, partial shadow modeling, measured terrain uncertainty and spacecraft hardware models.

Official DEM source: https://pgda.gsfc.nasa.gov/products/78
NASA Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html
