# OceanTwin3D

**Interactive 4D ocean exploration · SIH26067 prototype**

Explore a global ocean model on a Cesium globe, change depth and time, follow currents, and compare model profiles with synthetic instruments. The presentation branch combines the original PyCharm project with the globe explorer contributed in manaour2006/OceanTwin3D.

**All bundled model values and all 22 instrument profiles are synthetic.** This is a scientific visualization and integration prototype, with no live INCOIS connection or operational forecast claim.

## Run in PyCharm

Prerequisites: Python 3.12+ (tested with 3.13), Node.js 22, npm, and a hardware-accelerated WebGL browser.

Open the **repository root** in PyCharm. On a fresh clone:

```powershell
git clone --branch codex/presentation-ready https://github.com/sidhesh0706/OceanTwin3D.git
cd OceanTwin3D
python setup_project.py
.\.venv\Scripts\python.exe run.py
```

Choose the existing interpreter `.venv/Scripts/python.exe` in PyCharm, then run `run.py` or the included configuration under `.run/`. On macOS/Linux use `.venv/bin/python`.

Open **[the explorer](http://127.0.0.1:8000/)**. The optional cinematic introduction is at **[/?intro](http://127.0.0.1:8000/?intro)**. The explorer opens directly for presentations.

Setup installs locked dependencies and builds the frontend, including the pinned Cesium 1.128.0 engine, workers, styles and Natural Earth imagery. **Installation needs internet; the default demo runs locally afterward.** No Cesium token is required. Optional ion satellite/terrain layers require a user-supplied token and internet and are outside the offline demo path.

After frontend changes, run `npm run build` inside `frontend`. Restart the Python service after backend or bundled-data changes.

## Presentation walkthrough

See **[docs/DEMO.md](docs/DEMO.md)** for a five-minute script, exact analysis coordinates, and recovery steps. See **[docs/VALIDATION.md](docs/VALIDATION.md)** for the validation record.

## Features

- Global globe with local Natural Earth imagery, basin camera presets and geographic picking.
- Temperature, salinity, chlorophyll and derived current speed, with units and editable color ranges.
- Continuous depth interpolation and 13 weekly model frames with playback and scrubbing.
- Selected-depth maps draped on the globe; these show subsurface values at their geographic locations.
- Schematic 3D depth layers and sampled points. All available response levels are used; depth exaggeration is explicitly displayed.
- Model u/v current streamlines and particles. Animation speed is illustrative, not a real-time particle forecast.
- 17 Argo and 5 glider markers, an expandable instrument list, depth profiles and model comparison.
- Calculated RMSE, MAE and bias with model/observation timestamps and temporal offset.
- Profile probe: map click or coordinates, downward-increasing depth chart, all-variable table.
- Transect: two endpoints, shortest great-circle route, fixed-depth value-versus-distance chart.
- Region statistics: two rectangular corners, finite grid-cell mean/min/max/median/population standard deviation.
- NetCDF upload with validation and a restore-demo action.
- Presentation mode, guided tour, optional cinematic intro, local API documentation.
- Optional read-only WebMCP tool `read_ocean_view`.

## Model and scientific interpretation

| Dimension | Bundled extent |
| --- | --- |
| Longitude | −180° to 177.5°, 144 periodic coordinates at 2.5° |
| Latitude | −75° to 75°, 62 coordinates |
| Depth | 0, 10, 25, 50, 100, 200, 500, 1000, 2000 m |
| Time | 1 January–26 March 2026, 13 weekly frames |
| Instruments | 17 Argo + 5 gliders, profiles dated 12 February 2026 |

The deterministic generator combines analytic ocean-like gradients, thermoclines, currents and biological patterns with a Natural Earth land mask. Observations sample the model plus seeded perturbations. Their comparison residuals demonstrate the workflow; they do **not** establish independent model skill.

Coordinates, units and missing samples are validated. Horizontal interpolation uses actual coordinate spacing. Complete global grids extend periodically across the dateline; a transect from 170°E to 170°W follows the short arc. Interpolation does not fill across missing coastal data. Rendered coast-adjacent gaps reflect the coarse model mask and differ from the finer basemap coastline.

The depth map is a geographic projection. The 3D view uses schematic depth shells and sampled points with 100–1000× vertical exaggeration, labelled in the interface. The isosurface mode is a threshold-band preview, not marching cubes. Region statistics weight each wet grid cell equally; they are not area-weighted ocean averages. Transects are fixed-depth sections, not full vertical cross-sections. Polar latitudes outside ±75° have no bundled model data.

For `e = model − observed`: MAE = mean(abs(e)), RMSE = sqrt(mean(e²)), bias = mean(e). Only finite pairs contribute. UI comparisons use the displayed model time; the API chooses the nearest observation time when no time index is supplied.

Regenerate all demo data without network access:

```powershell
.\.venv\Scripts\python.exe -m backend.scripts.generate_demo_data
```

## Use another model

Choose **Settings → Load NetCDF dataset**, or configure these variables in the PyCharm run configuration:

```powershell
$env:OCEANTWIN_DATASET = 'C:\ocean-data\model.nc'
$env:OCEANTWIN_OBSERVATIONS = 'C:\ocean-data\observations.json'
.\.venv\Scripts\python.exe run.py
```

The backend does not automatically read `.env`. See `.env.example` for configuration.

Supported datasets are rectilinear regional or complete periodic global grids, with 1D latitude, longitude, depth and standard-calendar time coordinates. Common aliases (lat/lon, thetao/so/chl/uo/vo) and Celsius/Kelvin or m/s/cm/s are normalized. Depth must be metres, not pressure or sigma coordinates. Duplicate coordinates, curvilinear grids and regional grids split by the dateline require preprocessing.

Upload limit: 64 MiB compressed and 256 MiB estimated decoded variables. A failed upload preserves the current dataset. Uploads are session-only and attach no synthetic instruments to the new model. Global slices are capped at 100 coordinates per horizontal axis, volumes at 80 × 80 × 32, and currents at 37 × 37; regional caps are smaller. Analysis uses the original model grid.

## Development and checks

Run the backend from the root and Vite in a second terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```
```powershell
cd frontend
npm ci
npm run dev
```

Vite serves [localhost:5173](http://127.0.0.1:5173) and proxies the API to port 8000.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
cd frontend
npm test
npm run format:check
npm run build
```

## Architecture and API

FastAPI → OceanService → xarray/NumPy NetCDF adapter. React/TypeScript → Cesium globe and Recharts. The earlier Three.js regional renderer remains in the source tree. One Python process serves the API and production build.

Interactive [API documentation](http://127.0.0.1:8000/docs) lists all parameters. Principal routes: `/api/datasets`, `/api/ocean/slice`, `/api/ocean/volume`, `/api/currents`, `/api/ocean/inspect`, `/api/ocean/profile`, `/api/ocean/transect`, `/api/ocean/stats`, `/api/observations`, `/api/compare/{id}`.

Source locations: backend normalization in `backend/app/adapters/netcdf.py`, analysis in `backend/app/services/ocean.py`, globe in `frontend/src/explorer/GlobeExplorer.tsx`, controls in `frontend/src/App.tsx`, and analysis panels in `frontend/src/components/SpatialAnalysis.tsx`.

Natural Earth geography is public domain. Cesium is Apache-2.0; bundled third-party notices remain with its assets. Dependency licenses apply. Real data connectors, operational forecasting, assimilation, QC workflows and validated INCOIS datasets remain future work.
