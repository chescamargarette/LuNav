# Phase 3B local checks — 2026-11-15

- TypeScript syntax: `utils/missionTime.ts`, `utils/missionDynamics.ts`, `app/api/compare/route.ts`, `app/dev/horizons/page.tsx` parsed without errors.
- Utility modules: strict TypeScript check passed, no diagnostics.
- Developer TSX: typechecked with a minimal JSX/React declaration shim and no diagnostics; **not a Next.js build**.
- UTC offset conversion: `2026-12-10T08:30:00+08:00` -> `2026-12-10T00:30:00.000Z`.
- Half-hour sampling yields 5 observations for a two-hour interval.
- Circular azimuth interpolation: 359° at 00:00 to 1° at 01:00 produces 0° at 00:30.
- 250 Wh battery with 50 W load and no solar depletes during a 24-hour interval; SOC never negative.
- LEGS X-band 8.45 GHz, 384400 km, 20 dBW EIRP, 100 kbps, 2 dB other losses, 4 dB required Eb/N0 yields ~6.917 dB illustrative return margin; actual operational availability remains null.
- Mock Horizons route integration: `/api/compare` mission reference + local ISO offset + 0.5-hour interval + battery + LEGS -> status 200, 5 samples, 100% ephemeris coverage.
- Missing LOLA profile -> status 422 and code `LOLA_SITE_NOT_CACHED`.
- Chandrayaan-3 historical rover with LEGS DTE -> status 422 with relay architecture warning.

Not yet verified: actual Mac Next.js build, live JPL Horizons, station-specific LEGS geometry/scheduling, real-time range, independent NASA DEM accuracy.
