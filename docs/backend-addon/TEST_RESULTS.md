# Test results — local isolated environment

Date: 2026-11-15 (same session as file generation)

- TypeScript compilation (model and tests): PASS, `tsc --noEmit --project tsconfig.test.json`.
- Circular interpolation 355° / 5°, including seam: PASS.
- Profile provenance/coordinate mismatch rejection: PASS.
- Synthetic crossing interpolation and duration-weighted visibility: PASS.
- Longest continuous blackout durations: PASS.
- Shadow-gated direct solar power: PASS.
- Earth LOS-gated hypothetical RF link: PASS.
- Missing `terrain_aware` profile rejection: PASS.
- Spherical 3D terrain azimuth/elevation sample: PASS.
- Separately compiled compare route with a mocked Horizons handler: PASS, HTTP 200.
- Same compare route rejects `terrain_aware` without profile: PASS, HTTP 422.

**Not tested**: `npm run build` in the real LuNav repository, actual NASA JPL Horizons network data, real LOLA DEM reprojection, frontend results-card integration, Vercel deployment or any Git commit/push. The local Mac project files are unavailable in this environment. The tests are synthetic verification of mathematical/code pathways only.
