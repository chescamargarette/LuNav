# LuNAv Mode 3: Actual NASA LOLA Terrain

This additive package converts an **official NASA GSFC PGDA LOLA south-pole LDEM GeoTIFF** into the `points[]` + `provenance` JSON required by the existing `POST /api/compare` backend. It adds a JSON file chooser to **`app/dev/horizons/page.tsx` only**. The production frontend `app/page.tsx` is NOT altered.

## Scientific source

- NASA source catalog: https://pgda.gsfc.nasa.gov/products/90
- Full archive file: https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF
- Dataset: `LDEM_80S_80MPP_ADJ.TIF`, 80 m/pixel, 80°S–90°S, approximately 181 MB. NASA's catalog lists it as a cloud-optimized GeoTIFF, south-polar stereographic coordinates in meters in MOON_ME/DE421.
- NASA citation: Barker et al., 2023, *Planetary Science Journal*, 4, 183, https://doi.org/10.3847/PSJ/acf3e1 and data DOI https://doi.org/10.60903/gsfcpgda-lola-spole

### Installation (Mac, VS Code terminal already in LuNAv)

Make a backup of your current dev page before extracting. Download the ZIP into your Mac Downloads folder.

```sh
cp app/dev/horizons/page.tsx /tmp/lunav_dev_horizons_before_lola.tsx
unzip -o "$HOME/Downloads/LuNav_LOLA_Mode3_Addon.zip" -d .
python3 -m venv .venv-lola
source .venv-lola/bin/activate
python -m pip install --upgrade pip
python -m pip install numpy rasterio pyproj
mkdir -p data/lola
printf '\n/data/lola/\n/.venv-lola/\n' >> .gitignore
```

### Download the actual NASA DEM (not included in ZIP)

```sh
curl -fL --retry 3 "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDEM_80S_80MPP_ADJ.TIF" -o data/lola/LDEM_80S_80MPP_ADJ.TIF
ls -lh data/lola/LDEM_80S_80MPP_ADJ.TIF
```

**Do not commit the GeoTIFF to GitHub.** The `.gitignore` entry excludes the `data/lola` folder. Download takes time and needs disk space. If NASA blocks the request, open the catalog source link above and save the named GeoTIFF to the same path in Finder; do not substitute a terrain *image* or hillshade for an LDEM.

### Convert to the profile for Mode 3

```sh
python scripts/lola_to_horizon.py --dem data/lola/LDEM_80S_80MPP_ADJ.TIF --lat -89.5 --lon 0 --observer-m 1 --radius-km 30 --step-m 80 --az-step-deg 1 --out data/lola/real_lola_profile.json
```

The tool will print the elevation at the requested site, approximate slope, minimum/maximum horizon angles, and file path. It will STOP with an error if the DEM is missing, the lunar coordinate reference does not match the expected lunar sphere, or NoData occurs anywhere in the sampled radial footprint. **No fabricated skyline, default-zero fill, or automatic terrain extrapolation is used.**

### Use with the developer frontend

```sh
npm run build
npm run dev
```

Go to `http://localhost:3000/dev/horizons`:

1. Select **Paste real horizon profile** (the UI name is retained to preserve mode selection).
2. Choose the new **Load a NASA LOLA-derived horizon JSON** file input.
3. Select `data/lola/real_lola_profile.json`. The page synchronizes the latitude/longitude with provenance automatically.
4. Use the same dates and sampling interval as your Mode 1 and Mode 2 experiments, then click **Run backend analysis**.
5. Compare the resulting directional horizon, solar and Earth clearance, visibility %, darkness / blackout durations against the ideal and synthetic cases.

### What this version does and doesn't do

**It does:** read actual georeferenced lunar heights and coordinate reference information, transform to lunar geographic coordinates, ray-sample full 360° directions, compute spherical ENU apparent elevations and maximum angular terrain horizon, and create a reproducible JSON with data source metadata. Because Horizons and DEM frame conventions must match, validate this alignment at one known site before publishing mission-level results.

**It does not:** automatically download NASA elevation data in `POST /api/compare`, compute unlimited-distance sky visibility, prove absolute geodetic accuracy, include small ridges missed by 80 m pixels or 1° azimuth rays, model surface roughness from raw LOLA spots, propagate LOLA height uncertainties, or compute long-range terrain effects beyond the user-selected 30 km radius.

The output's `metadata` includes an actual DEM-derived **site elevation** and approximate **local slope**. The currently installed `/api/compare` consumes only `points` + `provenance`; it still reports terrain elevation, slope, and footprint area as `N/A`. We will wire these metadata fields into the API after verifying the real data.

**Height assumptions:** the script assumes metre-scale height above the Moon's 1,737,400 m reference sphere. Check the NASA product metadata on the actual file before treating numeric outputs as authoritative. The script checks for inappropriate nonlunar CRS and implausible unscaled radius values.

**Sampling limitations:** 80 m/pixel and 30 km radial extent are development settings, not mission-quality guarantees. For robust lunar south pole visibility, compare multiple radial extents and resolutions and cross-check with NASA published polar illumination / Earth visibility products. Any missing/filled-interpolated DEM pixel should be treated with the product's error/effective-resolution maps where possible.

### Local synthetic test (not a NASA accuracy test)

```sh
python tests/test_lola_converter.py
```

Test creates a mock lunar stereographic GeoTIFF with a ridge in one direction and verifies that the resulting horizon is higher in that direction. This does NOT verify any NASA pixel values. Live download and processing must be performed in your local environment.
