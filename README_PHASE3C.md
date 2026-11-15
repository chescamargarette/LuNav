# LuNAv Backend Phase 3C — station-specific NASA LEGS geometry

This is an **additive Phase 3B upgrade**. It adds predicted Earth-station geometry to your existing JPL Horizons + NASA LOLA + spacecraft power and RF pipeline. **It does not change your main `app/page.tsx`** and does not bundle the 180 MB LOLA DEM.

## Install (run inside LuNAv project)

After downloading `LuNav_Phase3C_LEGS_Geometry.zip` into `~/Downloads`:

```bash
cp app/api/compare/route.ts /tmp/lunav_compare_before_phase3c.ts
cp app/dev/horizons/page.tsx /tmp/lunav_dev_before_phase3c.tsx
unzip -o "$HOME/Downloads/LuNav_Phase3C_LEGS_Geometry.zip" -d .
npm run build
```

If the build succeeds, start `npm run dev`, then open `http://localhost:3000/dev/horizons` and test. **Do not commit until the live station geometry is checked.**

## What's new

- Queries JPL Horizons in two directions per station:
  - **Lunar observer -> Earth surface target**: ground station's apparent azimuth and elevation above the lunar terrain skyline and slant range.
  - **Earth ground observer -> lunar surface target**: Moon-site elevation above the ground station's local horizontal plane.
- Accounts for Earth's rotation and lunar orientation in NASA Horizons, instead of manually implementing approximate rotation calculations.
- Compares lunar station elevation against the **geolocated LOLA terrain horizon** at the station's azimuth.
- Applies a configurable Earth-side minimum tracking elevation (default 10°, **user assumption**, not a NASA LEGS operational commitment).
- Computes time-dependent **X/Ka return or forward link FSPL and margin** using the station slant range from Horizons plus preliminary LEGS RF numbers and user-supplied spacecraft assumptions.
- Returns station-by-station sample series, time-weighted modeled availability, visibility windows, a sampled best viable station, and modeled union-network windows.
- Unknown coordinates or failed Horizons lookups produce **N/A, not fabricated link coverage**. Actual operational availability is always `null`.

### Location metadata / completeness

- LEGS #1: White Sands Complex, NASA brochure coordinates **32.544863, −106.612504** (site/complex location, not independently surveyed antenna phase center). `altKm=0` assumed.
- LEGS #2: approximate SANSA Matjiesfontein site center **−33.2430694, 20.5480778**, from a 2026 South African civil site document (not surveyed antenna phase center). `altKm=0` assumed.
- LEGS #3: Australia / Geraldton preliminary. Exact antenna site is **not verified**; it is **unmodeled by default**. For testing only, you may explicitly supply `australiaRepresentative` lat/lon and the API will mark the result `representative_user_assumed`.

The source links and uncertainty are included in `utils/legsGeometry.ts` and `/api/references`. Station geometry requires JPL Horizons access at runtime. A deployed Next.js host must permit external HTTPS calls and enough request execution time.

## Developer page test

1. Open `/dev/horizons`, leave custom site `lat=-89.5`, `lon=0`, period **2026-12-10 00:00 UTC to 2026-12-11 00:00 UTC**, hourly interval.
2. Select `Automatic NASA LOLA (catalog)` (the Phase 2 catalog must contain `dev-test-site` at those coordinates).
3. Expand `NASA LEGS preliminary link scenario`. Enable `Enable assumed-range NASA LEGS link preview`.
4. Then enable **Query actual time-dependent LEGS station geometry via NASA Horizons (Phase 3C)**.
5. Keep `X`, `return`, `Spacecraft EIRP 30 dBW`, `100000 bit/s`, `required Eb/N0 4 dB` as **hypothetical inputs**, and `Minimum ground-station Moon elevation 10°`.
6. Click **Run backend analysis**. Scroll to **NASA LEGS — station-specific visibility**. White Sands and Matjiesfontein should show `modeled` or explicit `ephemeris_error`; Australia should say `location_unverified`. The site has previously had Earth below the terrain horizon on these dates, so **0% station contact may be correct**.

**If NASA query fails**: expand full JSON and send the exact `stationResults[].reason` for the affected station. Do not substitute a fixed range or claim contact available.

For a simple positive-contact sanity check, switch to `Ideal 0° horizon` and choose a near-side lunar location where Earth has positive elevation at the selected UTC dates. That checks geometry but is **not a terrain-aware landing analysis**.

## API contract

`POST /api/compare` accepts the original Phase 3B payload, plus:

```json
{
  "sites": [{ "id": "dev-test-site", "lat": -89.5, "lon": 0 }],
  "terrainMode": "terrain_aware",
  "startUtc": "2026-12-10T00:00:00Z",
  "endUtc": "2026-12-11T00:00:00Z",
  "stepHours": 1,
  "spacecraft": {
    "solarPanelAreaM2": 2,
    "solarPanelEfficiency": 0.25,
    "batteryCapacityWh": 250,
    "averageElectricalLoadW": 50
  },
  "legsScenario": {
    "siteId": "legs1-white-sands",
    "direction": "return",
    "band": "X",
    "frequencyMHz": 8450,
    "assumedRangeKm": 384400,
    "propagationAndPointingLossDb": 2,
    "spacecraftEirpDbw": 30,
    "bitRateBps": 100000,
    "requiredEbN0Db": 4,
    "geometry": {
      "enabled": true,
      "groundMinimumElevationDeg": 10,
      "stations": ["legs1-white-sands", "legs2-matjiesfontein", "legs3-australia"]
    }
  }
}
```

`legsScenario.siteId` and `assumedRangeKm` retain the **legacy** `legsAnalysis` preview. `legsNetworkAnalysis` uses per-station NASA slant range and ignores `assumedRangeKm` for its FSPL. Keep these as separate frontend fields.

Each `sites[]` response now includes `legsNetworkAnalysis` (or `null` when disabled):

- `stationResults[]`: `stationId`, `status`, `position`, `samples[]`, `windows[]`, `modeledContactPercent`, and reasons/warnings. Every sample includes `lunarAzimuthDeg`, `lunarElevationDeg`, `lunarHorizonDeg`, `lunarClearanceDeg`, `groundMoonElevationDeg`, `groundClearanceDeg`, `slantRangeKm`, `freeSpacePathLossDb`, `linkMarginDb`, `geometricLinkAvailable`, and `operationalContactAvailable: null`.
- `networkUnionSampled[]`: for each timestamp, eligible station IDs, the highest-margin station, and its RF margin.
- `modeledNetworkContactPercent`, `modeledNetworkContactHours`, `modeledNetworkWindows[]`: union **only over modeled stations**.
- `modeledStationCount`, `unmodeledStationCount`; no station availability inferred for absent/failed sites.
- `actualOperationalAvailability: null` (never schedule/commissioning claim).

The shared client-side type `utils/missionApiContract.ts` has been expanded accordingly. `GET /api/references` now exposes `approximateGeometryReference` on each LEGS station when available.

## Important caveats

- **Live JPL Horizons surface-target queries are NOT yet independently tested** in this add-on's build environment. The mocked parser and route tests pass; the user must perform a live developer runtime test before describing station-specific results as validated.
- Horizons `QUANTITIES=4,20`, `CSV_FORMAT=YES`, `CAL_FORMAT=JD`, `TLIST_TYPE=JD`, `TIME_TYPE=UT` are used. Target range is AU, converted to kilometers. Original Sun/Earth front-end angular data still comes from the older hourly Horizons adapter and may be interpolated.
- Browser/main frontend unchanged. Use the developer page to verify network results and then move to frontend integration.
- JPL's lunar surface target/observer coordinates and the LOLA DEM must share consistent lunar reference longitude/latitude/frame/datum to claim quantitative accuracy; registration is not yet independently verified. Terrain uncertainty, crater-shadow disk effects, distant horizons >30 km and sub-sampling transitions remain limitations.
- Ground-site terrain, local obstacles, detailed atmospheric effects, spacecraft antennas, exact ground pad height, site commissioning, access and scheduling are excluded.
- The LEGS network contact percentage is an **engineering prediction among modeled stations**, not NASA service availability. The RF parameters are mission-design assumptions, not verified historical spacecraft hardware.
- For the Phase 3C network mode, the API currently limits analysis to **145 requested timestamps** to avoid overloading Horizons. Increase `stepHours` or shorten the window if necessary. The legacy API can still analyze longer periods when station-specific geometry is disabled.
- Historical Chandrayaan-3 rover used rover→lander→Earth; direct LEGS is excluded for the historical rover preset unless evaluated as a user-created hypothetical mission.

## Verification performed by this package

- Six local unit tests passed for NASA query construction, CSV parsing and partial-data rejection, unknown Australia, geometry integration, and terrain-obstructed link.
- Core utilities TypeScript checks passed, as did a developer TSX syntax/type check under a JSX shim. These do not replace your Mac's Next.js build.
- A mocked API route smoke test returned HTTP 200 with two modeled stations, Australia explicitly unavailable, and combined-network time series.
- **No live NASA station-specific data was accessed in this environment.**

## After live test — commit and push

```bash
git check-ignore data/lola/LDEM_80S_80MPP_ADJ.TIF
git check-ignore .venv-lola/
git add -A
git diff --cached --stat
git commit -m "Add NASA LEGS station-specific geometric visibility and link analysis"
git push -u origin feature/integration
```

Only run the commit after confirming the staged files don't contain the large DEM, `.venv-lola` or secrets.
