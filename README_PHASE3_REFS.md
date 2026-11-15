# LuNAv Phase 3A — Historical mission references and NASA LEGS link preview

This is an ADDITIVE backend package. It does not change `app/page.tsx`, `app/dev/horizons/page.tsx`, `/api/compare`, the existing LOLA catalog, or the downloaded GeoTIFF.

## Install from repo root in VS Code terminal

Download the ZIP, then run:

```sh
unzip -n "$HOME/Downloads/LuNav_Phase3A_Missions_LEGS.zip" -d .
npm run build
```

In development mode (`npm run dev`), open:

- `http://localhost:3000/api/references` — three published historical lunar mission sites, known specifications, nominal terrain coverage flags, three preliminary NASA LEGS sites, X/Ka ground G/T and forward-link minimum EIRP.
- `POST http://localhost:3000/api/legs/link-preview` — fixed-range lunar **return** link estimate using NASA LEGS X/Ka G/T, or **forward** link estimate using NASA minimum ground-station EIRP and the spacecraft receiver sensitivity.

**Example API request:**

```sh
curl -sS -X POST http://localhost:3000/api/legs/link-preview -H 'Content-Type: application/json' -d '{"siteId":"legs1-white-sands","band":"X","frequencyMHz":8450,"lunarToGroundRangeKm":384400,"spacecraftEirpDbw":20,"bitRateBps":100000,"totalPropagationAndPointingLossDb":2,"requiredEbN0Db":4}'
```

**Forward (ground-to-rover receiver) example:**

```sh
curl -sS -X POST http://localhost:3000/api/legs/link-preview -H 'Content-Type: application/json' -d '{"direction":"forward","siteId":"legs1-white-sands","band":"X","frequencyMHz":7180,"lunarToGroundRangeKm":384400,"spacecraftReceiverGainDbi":0,"spacecraftReceiverSensitivityDbm":-120,"totalPropagationAndPointingLossDb":2,"requiredPowerMarginDb":3}'
```

All radio hardware numbers and the distance in these samples are **hypothetical**. A positive margin is NOT equivalent to an actual communications window. A rover using a lander relay requires two separate links, and the historical Chandrayaan-3 rover did not use NASA LEGS.

## Sources and integrity

- IM-1 actual site: https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/
- IM-2 final site & mission: https://ntrs.nasa.gov/api/citations/20260003150/downloads/MSolo%20PRIME-1%20overview%20and%20results%20-%20LSSW.pdf
- Chandrayaan-3 site/power/comms: https://www.isro.gov.in/Chandrayaan3_Details.html and https://www.isro.gov.in/Ch3_Alpha_Particle_X-ray_Spectrometer.html
- NASA LEGS GOCO specs: https://explorers.larc.nasa.gov/APSMEX26/SMEX/pdf_files/Prog05d_LEGS_Brochure_r25-1.pdf

Published unknowns are null. We do not claim IM-1 or IM-2 power system budgets were verified. Chandrayaan-3's 50 W is a published rover power figure, not an established average electrical consumption or array size.

## What this DOES NOT do yet

1. No historical mission dropdown on the main frontend; use the new `/api/references` response to populate it when integrating UI.
2. No selection changes `/api/compare` automatically. The UI must send the chosen coordinates and only explicitly modeled spacecraft assumptions. Unknown mission radio/power fields must not silently default to claimed flight hardware.
3. No precomputed LOLA horizon profiles at these three sites: NASA DEM profile generation/export remains a separate step; IM-1 is boundary-limited and Chandrayaan-3 is outside the currently downloaded raster.
4. No verified exact station coordinates, operational commissioning status, scheduled access, station-specific Moon visibility, real-time station-to-Moon range, or two-hop lander relay modeling.
5. NASA's LEGS specs are a preliminary design reference, not a promise all three antennas are operational.

## Future integrated model

- `POST /api/compare` accepts site+spacecraft+groundSegment selection, using source-backed historical mission presets and explicit design scenarios.
- Compute 3-D Moon site-to-LEGS station vector over UTC to determine surface terrain horizon and station Earth-side Moon elevation.
- Use precise time-varying range in FSPL for each site and ground station; score best available scheduled station, rather than treating all stations as simultaneously available.
- For rover→lander relay, compute rover-to-lander link and lander-to-LEGS as independent budgets.
- Use real `G/T` + EIRP + bit rate + required `Eb/N0` for X/Ka return link rather than the old receiver-sensitivity approximation.
