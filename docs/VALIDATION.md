# Validation — 9 September 2026

## Integration update — 10 September 2026

Integrated teammate commit `1d129c0`, including the shortened introductory sequence, revised local ocean camera, depth-label rail and Reset view control. Fixed the new default-scale effect so refreshing a regional time/depth frame preserves user-selected exaggeration, and anchored the depth rail to viewport coordinates.

The integrated production build passed, as did 28 backend and 3 frontend tests (the same two previously recorded Python dependency warnings). Browser review verified the NASA Earth view, Argo-to-ocean transition, profile comparison, broad Top-down coverage, 3D ocean and Reset view controls. No warning/error logs were captured during that local-ocean review. Use `/?explore` to skip the intro during the presentation; the root URL now starts the intro.

Scope: presentation preparation on `codex/presentation-ready`, based on teammate commit `fc337c6` and the original prototype `522ef8d`.

## Automated checks

- Backend: **28 tests passed** on Windows / Python 3.13.
- Frontend: **3 interpolation tests passed** using Node's test runner.
- TypeScript and Vite production build: passed.
- Prettier source/style checks: passed.

Backend coverage includes data dimensions, finite/null serialization, interpolation, temporal changes, current fields, independent NumPy comparison metrics, malformed requests, upload validation and preservation of the previous dataset, periodic profile/inspection sampling, short-arc dateline transects, poleward great-circle curvature, invalid arc endpoints, and independently calculated region statistics.

Frontend tests check nonuniform coordinate interpolation against an analytic plane, periodic seam spacing and longitude normalization, and missing-cell preservation.

Regional cutout regression checks compare every returned slice cell with the source model, verify Pacific date-line continuity and current-grid alignment, check clipped coastline bounds, and assert that the Indian Ocean view includes the original prototype's domain. The local renderer fits its camera to the available viewport and exposes two native-data boundary sections.

The regenerated demo has 22 instruments, each with nonempty profiles; every supported observation variable has finite matched comparison levels in the regression suite.

## Browser verification

The production build was served by `run.py` at port 8000 and exercised in the in-app Chromium browser.

- Direct explorer bootstrap, local Cesium engine and local Natural Earth basemap loaded.
- Schematic 3D shells completed rendering after asynchronous geometry preparation.
- Profile probe returned all nine depth levels and all four variables.
- Transect A=(5,65), B=(15,85) returned a 2,453.2 km section and a visible distance chart.
- Region statistics for those corners returned 30 wet / 36 cells and mean 29.841 °C at frame 1 / surface.
- Expanded instrument list displayed all 17 Argo and 5 gliders; selecting an Argo opened its profile.
- Model comparison displayed computed RMSE, MAE, bias, matched levels and time offset.
- Depth chart direction verified in the rendered chart: 0 m above 2000 m.
- Timeline scrubbing displayed a loading state while preserving the previous frame.
- No renderer errors were recorded during these checks.

Desktop layouts were inspected with full-page screenshots. The in-app browser scales screenshots differently from CSS pixels; chart direction was also checked using rendered text positions. This is not a performance benchmark or a guarantee for every projector/GPU.

## Local/offline operation

Cesium 1.128.0 is an exact npm dependency. The predev/prebuild script copies its engine, workers, assets, styles and license notices into the generated local public directory. Default viewer creation disables the implicit ion basemap and uses bundled NASA Blue Marble imagery, with Natural Earth tiles as fallback. Synthetic NetCDF, sensor profiles, geography and fonts require no external service during normal default operation.

The initial float-to-ocean transition was visually checked in Chromium. The final wider cutout, responsive camera fit and NASA image passed build/data checks; the browser automation session became unavailable before the final visual pass. Rehearse the three view controls on the presentation laptop.

External ion layers are opt-in and were not tested with an account token. A fresh installation still needs network access for dependencies. No system-wide network setting was changed during verification.

## Known limits

- Synthetic values and instruments, not live INCOIS data or independent forecast validation.
- Coarse model coast mask, no data beyond ±75° latitude in the demo.
- Schematic vertically exaggerated 3D shells; no full volume ray casting or marching-cubes isosurface.
- Fixed-depth transects; region means are unweighted finite grid-cell means.
- Real operational NetCDF products, nonstandard calendars, curvilinear coordinates and regional dateline-split grids need separate preprocessing/validation.
- Optional cinematic intro and ion imagery are secondary to the rehearsed direct-explorer workflow.
- Two dependency warnings remain in pytest: a Starlette/AnyIO deprecation and a NumPy/native-extension layout warning on lazy import. All numerical regression checks passed; the warnings were not suppressed.
