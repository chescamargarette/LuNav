# LuNAv Phase 3B — time, battery, mission presets, optional LEGS scenario

**This is an additive update to your installed Phase 2 + Phase 3A.** It intentionally does not replace your main `app/page.tsx`. This package adds an improved `/api/compare` plus controls on `app/dev/horizons/page.tsx` and shared client-side types.

## Install (run commands inside your LuNAv project)

Download `LuNav_Phase3B_FrontendReady.zip` into your Downloads folder.

```bash
cp app/api/compare/route.ts /tmp/lunav_compare_before_phase3b.ts
cp app/dev/horizons/page.tsx /tmp/lunav_dev_before_phase3b.tsx
cp utils/terrainAnalysis.ts /tmp/lunav_terrain_before_phase3b.ts
unzip -o ~/Downloads/LuNav_Phase3B_FrontendReady.zip -d .
npm run build
```

If build succeeds:

```bash
npm run dev
```

Visit `http://localhost:3000/dev/horizons`.

Test 1: select **Custom coordinates**, **Automatic NASA LOLA (catalog)** and lat=-89.5 lon=0 with 2026-12-10 to 2026-12-11. This uses your already-generated `utils/generatedLolaCatalog.ts`. The ZIP **does not overwrite that catalog**.

Test 2: toggle preliminary LEGS link preview. The reported budget is not a contact availability prediction.

Test 3: choose IM-2 Athena in the mission selector, switch to **Ideal horizon** to test just the mission/ephemeris binding, then generate and export its own LOLA profile before selecting **Automatic NASA LOLA** for that site. Missing historical profiles return `LOLA_SITE_NOT_CACHED`, not fabricated terrain data.

## API endpoints

- `GET /api/references`: historical missions and three preliminary LEGS sites (from Phase 3A).
- `GET /api/lola/sites`: list of exported terrain profiles (from Phase 2).
- `POST /api/legs/link-preview`: individual preliminary LEGS budget (from Phase 3A).
- `POST /api/compare`: one to four sites, optional mission reference, mission times and spacecraft/LEGS models.

Sample request:

```json
{
  "sites": [{"id":"dev-test-site","lat":-89.5,"lon":0}],
  "startUtc":"2026-12-10T08:30:00+08:00",
  "endUtc":"2026-12-11T08:30:00+08:00",
  "timezone":"Asia/Manila",
  "stepHours":1,
  "terrainMode":"terrain_aware",
  "spacecraft":{
    "solarPanelAreaM2":2,
    "solarPanelEfficiency":0.25,
    "panelTiltDeg":80,
    "panelFacingAzimuthDeg":180,
    "batteryCapacityWh":250,
    "averageElectricalLoadW":50,
    "initialBatterySocPercent":100,
    "batteryChargeEfficiency":0.85,
    "batteryDischargeEfficiency":0.95,
    "batteryReservePercent":0
  },
  "legsScenario": {
    "siteId":"legs1-white-sands",
    "direction":"return",
    "band":"X",
    "frequencyMHz":8450,
    "assumedRangeKm":384400,
    "propagationAndPointingLossDb":2,
    "spacecraftEirpDbw":20,
    "bitRateBps":100000,
    "requiredEbN0Db":4
  }
}
```

Alternatively set `"missionReferenceId":"im2-athena"` and omit `sites` to select published mission location. Historical hardware values are **NOT** copied to spacecraft input assumptions unless independently verified. The chosen mission reference (including source URLs and null fields) is returned as `missionReference`.

Top-level response: `application`, `apiVersion`, `source`, `requestedStartUtc`, `requestedEndUtc`, `displayTimezone`, `stepHours`, `ephemerisSamplingMethod`, `missionReference`, `sites[]`, `warnings[]`.

For each site, retain Phase 2 fields: `terrain`, `timeline`, `availability`, `energy`, `linkBudget`, `segments`, `assumptions`, and `warnings`. New fields: `energySimulation` (time series SOC, first shortfall, unserved load) and `legsAnalysis` (budget, **candidate-only** timeline, operational availability null).

## Known limits — do not overclaim these

1. The Horizons adapter requests **1-hour raw samples**, and off-hour timestamps/sub-hour display samples are **linearly interpolated**, not independent Horizons results. Set sampling fine enough for shadow transitions.
2. LEGS precise operational station coordinates, Earth-ground-station line of sight, station scheduling, and actual time-varying Earth–site range are **NOT** modeled. LEGS estimates use a fixed user-assumed range. `actualContactAvailabilityPercent` remains null.
3. Mission-specific historical spacecraft parameters are only displayed when source-backed. The defaults in the developer frontend are **generic assumed spacecraft**; do not label them as IM-2, IM-1 or Chandrayaan-3 hardware.
4. A 30 km terrain horizon can omit distant obstacles, and LOLA DEM processing/azimuth reference validation remains preliminary.
5. The battery model uses panel power samples and constant load with trapezoid approximation, fixed efficiencies, no temperature/charging limits, no operation-state management, and no partial solar disk.
6. `Chandrayaan-3` historical Pragyan rover was rover→lander→Earth. A LEGS direct rover scenario with its historical preset is rejected. Select a custom hypothetical mission for a redesigned DTE rover.
7. `timezone` is an IANA display label. ISO date strings **must include an explicit `Z` or numeric UTC offset**. Do not send local timestamps without an offset.
8. No baseline spacecraft specs are invented to fill null values.

## Validation performed for this package

- Syntactic parsing of route, utility and TSX files.
- TypeScript compilation of utility modules.
- Local unit tests for UTC normalization, 359°→1° wraparound, battery depletion and LEGS unknown operational contact.
- Mock Horizons route smoke test: phase3b `/api/compare` returns 200 for preset + offset + 0.5-hour samples + battery and LEGS, returns 422 for unknown LOLA profile and rejects historically incorrect Chandrayaan-3 DTE LEGS modeling.

**Live Horizons, live NASA station geometry and your local Next.js build remain untested here.**
