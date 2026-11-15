# LuNAv Backend Phase 2 — Automatic LOLA site catalog + spacecraft-dependent analysis

**Project Hail Mayari · November 15, 2026**

This is an **add-on to the existing LuNAv Next.js 16 app**, not a replacement application.
It leaves `app/page.tsx`, the main frontend, and `app/api/horizons/route.ts` untouched.
It changes `app/api/compare/route.ts`, `utils/terrainAnalysis.ts`, the developer test page,
and the LOLA converter; it adds an exported small LOLA catalog and a catalog endpoint.
Do **not** overwrite local files without a backup or a clean Git commit.

## What has been implemented

- New `GET /api/lola/sites` returns the list of available precomputed NASA LOLA landing-site profiles (zero until export).
- `POST /api/compare` automatically retrieves a verified-coordinate cached horizon profile for
  `terrainMode: "terrain_aware"` if the site omits `horizonProfile`. Existing inline profiles remain supported.
  An uncached location returns `422` with `code: LOLA_SITE_NOT_CACHED`, **never** an ideal-horizon fallback.
- `terrain.siteElevationM`, `localSlopeDeg`, `footprintSurfaceAreaM2`, `footprintProjectedAreaM2`, `footprintRadiusM`,
  and `terrainSearchRadiusKm` can now come from local NASA DEM-derived profile metadata.
- Python converter calculates approximate DEM-based surface area in a 500 m radius footprint.
  These numbers reflect raster resolution, map projection and local gradients; they are not a guaranteed engineering survey.
- Extended spacecraft inputs (all optional; outputs are `null` when insufficient data):
  - `batteryCapacityWh`, `averageElectricalLoadW` -> `energy.batteryEnduranceHours`, `batterySurvivesLongestDarkness`
  - `transmitterPowerDbm`, `transmitterAntennaGainDbi`, `transmitterCableLossDb` -> effective EIRP
  - `receiverNoiseFigureDb`, `receiverBandwidthHz`, `requiredSnrDb` -> sensitivity at 290 K
  - `polarizationLossDb`, `pointingLossDb`, `implementationLossDb` plus original `otherLinkLossDb`
  - all original direct-EIRP/sensitivity fields remain compatible with Mode 1–3
- Developer page `/dev/horizons` has **Automatic NASA LOLA (catalog)** mode, battery fields and switchable RF-input models.
- Every site still includes Sun/Earth azimuth/elevation, terrain clearance, visibility timeline,
  window durations, solar-power estimates and link budget results from Phase 1.

## Install (from repo root in VS Code Terminal)

1. Ensure the working directory is the `lunav` project and that current work is committed.
2. Download `LuNav_backend_phase2.zip` into `~/Downloads`.
3. Run the following **commands without copying any comment lines**:

```sh
git status --short
cp app/api/compare/route.ts /tmp/lunav_compare_before_phase2.ts
cp utils/terrainAnalysis.ts /tmp/lunav_terrain_before_phase2.ts
cp app/dev/horizons/page.tsx /tmp/lunav_dev_before_phase2.tsx
cp scripts/lola_to_horizon.py /tmp/lunav_lola_converter_before_phase2.py
unzip -o "$HOME/Downloads/LuNav_backend_phase2.zip" -d .
```

4. Recompute the real-LOLA profile to include footprint area and correct standard JSON handling. **Do not download the NASA GeoTIFF again.**

```sh
source .venv-lola/bin/activate
python scripts/lola_to_horizon.py --dem data/lola/LDEM_80S_80MPP_ADJ.TIF --lat -89.5 --lon 0 --observer-m 1 --radius-km 30 --step-m 80 --az-step-deg 1 --out data/lola/real_lola_profile.json
python scripts/export_lola_catalog.py --site dev-test-site=data/lola/real_lola_profile.json
```

The last command generates `utils/generatedLolaCatalog.ts`, which **should be committed to Git**. This is a small profile, not a GeoTIFF.

5. Verify. Your production Next build is the final compilation check.

```sh
npm run build
```

6. After a successful build, run `npm run dev`. Open `/dev/horizons`, select **Automatic NASA LOLA (catalog)**, and run the same test (`-89.5`, `0`, Dec 10–11 2026). It should require **no file picker**.

Browse `http://localhost:3000/api/lola/sites` to inspect your cached site metadata.

## Main API contract

`POST /api/compare`, JSON request:

```json
{
  "sites": [{"id": "dev-test-site", "lat": -89.5, "lon": 0}],
  "startUtc": "2026-12-10T00:00:00Z",
  "endUtc": "2026-12-11T00:00:00Z",
  "stepHours": 1,
  "timezone": "UTC",
  "terrainMode": "terrain_aware",
  "spacecraft": {
    "solarPanelAreaM2": 2,
    "solarPanelEfficiency": 0.25,
    "panelTiltDeg": 80,
    "panelFacingAzimuthDeg": 180,
    "minSolarPowerW": 20,
    "batteryCapacityWh": 250,
    "averageElectricalLoadW": 50,
    "radioFrequencyMHz": 2200,
    "transmitterPowerDbm": 30,
    "transmitterAntennaGainDbi": 10,
    "transmitterCableLossDb": 1,
    "receiverGainDbi": 35,
    "receiverBandwidthHz": 100000,
    "receiverNoiseFigureDb": 3,
    "requiredSnrDb": 8,
    "earthDistanceKm": 384400,
    "polarizationLossDb": 1,
    "pointingLossDb": 1,
    "minLinkMarginDb": 0
  }
}
```

`sites[]` in the response now includes `terrainCatalogId`, `terrain` elevation/slope/area metadata, `energy`, and `linkBudget` alongside all previous fields. The server computes effective EIRP from Tx power+gain-loss or accepts `transmitterEirpDbm`. It computes receiver sensitivity from thermal noise, NF, SNR and bandwidth or accepts `receiverSensitivityDbm`. These are **alternative representations** of the same quantities. The direction modeled is the lunar-surface transmitter to Earth-based receiver. The Earth distance remains a **user-assumed constant** until a validated Horizons distance input is integrated.

## More cached sites

For a second site, use the same local NASA DEM to generate a second JSON:

```sh
python scripts/lola_to_horizon.py --dem data/lola/LDEM_80S_80MPP_ADJ.TIF --lat -89.6 --lon 5 --observer-m 1 --radius-km 30 --step-m 80 --az-step-deg 1 --out data/lola/site_b.json
python scripts/export_lola_catalog.py --site dev-test-site=data/lola/real_lola_profile.json --site site-b=data/lola/site_b.json
```

**These second-site coordinates are an example only, not a NASA-verified landing recommendation.** Always pass *all* desired sites when re-exporting: the catalog generator replaces the prior catalog contents. Candidate site coordinates should be established from actual mission or terrain references.

## Tests performed in isolated environment

- `tsc --project tsconfig.test.json` and unit tests for horizon interpolation, crossing durations, solar/RF, catalog, DEM metadata, battery endurance: PASS.
- Python synthetic lunar GeoTIFF horizon & area test: PASS.
- Compiled API route smoke tests with mocked JPL Horizons adapter: PASS for 200 on ideal and cached terrain, 422 on unknown cache, `GET /api/lola/sites`.
- Developer page TSX syntax parse: PASS.

**Still requires real Mac checkout validation:** `npm run build` and live route requests after install. We did **not** test on the user's actual new branch, the actual downloaded 180 MB GeoTIFF, or Vercel deployment.

## Critical scientific and product boundaries

- The 80 m raster and 30 km horizon radius may miss local/distant obstructions. Check Moon CRS, azimuth convention, elevation datum and uncertainty.
- Projected/surface footprint areas are approximate sampled pixel areas at **500 m radius**, **not** solar-panel area, safe landing area, or a claim of engineering-grade slope.
- Solar intensity uses 1361 W/m² near 1 AU, fixed Sun distance and panel orientation. No partial Sun disk / battery charging.
- Battery endurance equals nameplate capacity divided by assumed constant load. It is not a power-thermal balance.
- RF link uses FSPL and fixed assumed Moon–Earth range with user-defined gains and losses; no Horizons-measured range, terrain diffraction, atmospheric/pointing dynamics or ground station scheduling. A positive hypothetical margin does not prove a real link.
- Current `/api/compare` Horizons adapter only accepts **UTC-midnight dates** and **whole-hour 1–24 hour steps**, max 31 days; timezone input remains UTC only. Supporting arbitrary timestamp/timezone inputs requires a tested Horizons adapter upgrade.
- `terrain_aware` automatic lookup supports **preprocessed sites**, not arbitrary map clicks in real time. The main frontend should offer only available sites for real LOLA analysis, or explicitly show terrain unavailable for other sites until on-demand DEM processing is implemented.
- A curated, source-verified historical mission database and nearby-landings endpoint are not included in this phase.

Original DEM: NASA PGDA `LDEM_80S_80MPP_ADJ.TIF`, https://pgda.gsfc.nasa.gov/products/90 . The local GeoTIFF stays in ignored `data/lola/`; the small generated `utils/generatedLolaCatalog.ts` is deployed with app code.
