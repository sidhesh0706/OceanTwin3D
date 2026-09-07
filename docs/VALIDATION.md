# Validation record

Validated locally on Windows with Python 3.13.9, Node.js 22.18.0, and the Codex in-app Chromium browser. This record distinguishes implementation, automated checks, and browser observations; it does not claim production certification or a hardware performance benchmark.

## Automated checks

- `npm run build`: passed TypeScript compilation and Vite production build. Final output is split into application, ocean-engine, and profile-chart bundles; no build warnings in the final run.
- `npm run format:check`: passed for frontend source and Vite configuration.
- Ruff Python lint: all checks passed. Python sources were formatted with Ruff.
- `python -m compileall -q backend run.py setup_project.py`: passed.
- `python -m pytest -q`: **22 tests passed**, including independent analytic interpolation and metric checks, missing-value serialization, aliases/units, invalid coordinates, depth/time bounds, sensor responses, CORS, malformed uploads, valid model replacement, and demo restoration.
- The last full pytest run reported two dependency warnings: a Starlette/AnyIO deprecation and a NumPy binary-layout warning during lazy import. Direct model loading and live API requests succeeded. An optional warning-as-error diagnostic rerun was blocked by automatic approval review because of the account usage limit; it was not bypassed.
- The per-service cache scoping and final lint cleanup happened after that full test run. The resulting backend was restarted and smoke-tested through its live HTTP endpoints; the complete pytest suite was not repeated after those small changes.

## Browser checks

The following behavior was exercised against the actual running viewer:

| Check | Observed result |
| --- | --- |
| Initial model | Real WebGL scene, recognizable land geometry, warm surface field, instrument markers, animated streaks, depth cues |
| Depth 0 → 500 m | Plane descends; displayed range changes from 25.75–31.04 °C to 6.73–7.71 °C at frame 1 |
| Volume | Multiple colored depth layers visible below the coast and surface, using the model's nine levels |
| Variables | Temperature, salinity, chlorophyll and current speed controls update the selected field; salinity and speed units/ranges verified |
| Ocean picking | Center-slice click returned a wet sample near 6.71° N, 73.32° E, with all four variables |
| Argo | Scene marker opened ARGO-2902487, its 2000 m profile and two chart curves |
| Glider | GLIDER-IO-01 opened a 1000 m profile, with eight matched levels |
| Comparison | Observed/model lines present; RMSE/MAE/bias visible; off-time comparison flagged and frame 5 time alignment confirmed |
| Time | Scrubbed to frame 5; playback advanced the displayed UTC timestamp; pause stopped playback |
| Opacity | Range keyboard controls changed the value from 5% to 100% |
| Vertical scale | Controls changed 5× → 10× → 5× and updated the display |
| Color validation | Minimum 40 with maximum 31 was rejected; restoring minimum 2 removed the invalid range |
| Isosurface preview | Mode switches to the explicitly labeled threshold-point preview |
| Presentation | Controls collapse; variable, mode, depth, timeline and colorbar remain available; switched to volume in presentation mode |
| Demo tour | Completed all five stages and returned to its idle button, ending in temperature volume mode with ARGO-2902487 selected, both profile curves visible, nine matched levels and aligned model/observation times |
| Service recovery | Stopped service displayed an explanatory error instead of a blank page; the built viewer recovered after the Python service was restarted |
| Standalone serving | `run.py` returned the production frontend and assets on port 8000, with healthy API, depth slice and calculated comparison responses |
| WebMCP | `read_ocean_view` registered with the expected read-only schema; valid input returned displayed state and invalid input was rejected |

No React runtime or WebGL shader errors were observed. An expected Vite websocket-disconnection message was logged when the development server stopped; the final preview uses the standalone production server.

## Responsive checks

The browser's 67% scale required compensating its viewport override. Effective CSS viewports were approximately **1366 × 768**, **1440 × 900**, and **1920 × 1080**, with at most one pixel of rounding. DOM measurements confirmed that the header, side panels and timeline fit in the main viewport. Side-panel bodies scroll when necessary; the whole desktop page does not require content scrolling.

Scene screenshots were reviewed for depth and geographic structure. The in-app screenshot service cropped parts of full-frame captures at its fractional browser scale, so an exact pixel-perfect full-screen screenshot comparison at all three dimensions is not claimed. No GPU frame-time or 60 FPS benchmark was performed.

## Remaining validation limits

- No actual INCOIS NetCDF or measured instrument dataset was available. Upload tests use controlled NetCDF fixtures, not production ocean files.
- Browser file-picker upload was not independently automated; the multipart API upload, rejection and atomic replacement behavior are covered by the integration tests.
- The PyCharm entry point was exercised as `python run.py`; opening the shared XML configuration inside the native PyCharm application was not automated.
- Fresh installation on a second computer, non-Windows systems, older GPUs, prolonged playback and production-sized datasets remain untested.
- Real bathymetry, true marching-cubes surfaces, sensor histories, temporal interpolation and production infrastructure remain outside the implemented prototype scope, as explained in the README.
