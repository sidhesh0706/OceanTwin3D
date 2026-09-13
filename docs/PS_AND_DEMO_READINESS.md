# OceanTwin: problem-statement check and demo-video plan

Reviewed 13 September 2026 against the problem statement supplied by the team. This is a prototype-readiness review, not certification of INCOIS operational readiness.

## Exact sample upload test

File: `OceanTwin_Sample_Global_Ocean.nc` (8,679,349 bytes), copied from the bundled synthetic global model. Posted as multipart data to the running test server on port 8001. The presentation server on port 8000 was not replaced during this test.

Upload returned HTTP 200. Health, temperature slice at 500 m/time 6, salinity volume, currents at 100 m/time 6, full-depth profile, transect and regional statistics all returned HTTP 200. Uploaded metadata contains 13 dates, 9 depths, 62 latitudes and 144 longitudes. Observations were correctly empty because NetCDF upload does not include the separate instrument catalogue. Restoring the demo returned HTTP 200 and brought back 22 instruments.

Found and fixed: Restore demo model was hidden for synthetic uploads, leaving no UI route to recover the bundled instrument catalogue. It is now always available in Settings. The API upload route was exercised with the exact file; this test did not automate the operating-system file chooser.

## Requirement coverage

| Problem-statement requirement | Current implementation | Remaining work |
| --- | --- | --- |
| Browser-native 3D model visualization | React, Cesium globe, Three.js local water column, selected-depth surfaces and volumetric points | Scientific volume ray casting is not implemented; test target hardware performance |
| Temperature, salinity, currents, depth and time | Implemented, plus chlorophyll, animated currents and model time playback | Validate against a representative INCOIS dataset |
| Isosurface extraction | Threshold-band point/layer preview | True triangulated isosurface extraction, such as marching cubes |
| Instrument overlays and timestamped profile charts | Bundled synthetic Argo and glider profiles with model comparisons | User ingestion of instrument profiles; CTD/BGC sensor types and matching real observations |
| NetCDF ingestion | xarray adapter, aliases, units, coordinate validation and upload | Broader CF grids/calendars; curvilinear grids require preprocessing |
| Delimited text/ASCII ingestion | Not implemented as a user upload | CSV/text profile parser with schema, units, missing-value handling and validation |
| Variable controls and colorbar | Variable selector, min/max range, opacity, vertical exaggeration presets | Palette selector and log/linear scale; continuous exaggeration slider |
| Lightweight web API | FastAPI REST, local browser client, bounded fields and compressed responses | INCOIS deployment configuration and representative multi-user/load testing |
| OPeNDAP and OGC WMS/WCS interoperability | Not implemented | Dedicated adapters/endpoints and standards validation |
| Extensible architecture | Separated NetCDF adapter, services and renderers | A documented plugin registry; variable identifiers are currently fixed in code |
| Outreach and science communication | Branded intro, Earth-to-ocean transition, presentation mode | Clear recorded narrative and labels explaining synthetic data and vertical exaggeration |

## Priorities

Before recording: use a stable build; keep the sample in an easy-to-find folder; rehearse upload and restore; set time to 12 February 2026 before comparing the bundled profiles; verify audio, screen capture and target resolution. Do not add a large untested feature immediately before recording.

Highest-value next development: observational CSV/text upload and a paired model/profile sample. This directly addresses the central requirement to integrate incoming observations with model data. Next add palette selection and log/linear color scales. Follow with true isosurfaces, additional sensor schemas and standards-based connectors.

A vetted real model file plus matching observations would strengthen the demonstration more than additional visual effects. Record data provenance, units, time alignment and any preprocessing. The current sample is synthetic and should be labelled as such; it is not a live INCOIS feed or an operational forecast.

## Suggested five-minute recording

| Time | Screen action | Point to explain |
| --- | --- | --- |
| 0:00–0:25 | Premium splash, introduction, enter globe | One environment for model fields and instrument evidence |
| 0:25–1:05 | Ocean overlay, variables, depth and time | Explore a four-dimensional model; time is the fourth dimension |
| 1:05–2:00 | Set 12 Feb; select an Argo float; show flat/3D views and profile | Timestamped observations compared with the model; explain RMSE/MAE/bias |
| 2:00–2:40 | Transect and regional statistics | Fixed-depth spatial analysis, not a vertical transect curtain |
| 2:40–3:30 | Settings: load the sample NetCDF; show updated fields | A validated model upload; separate observations are not embedded in this file |
| 3:30–4:00 | Restore demo model; show instruments returning | Recover the paired demonstration data for the full workflow |
| 4:00–4:35 | Presentation mode, currents and volume | Browser-native scientific exploration and outreach |
| 4:35–5:00 | Short roadmap slide | CSV observations, real data validation, true isosurfaces and interoperability |

Avoid claiming live monitoring, operational advisory accuracy, arbitrary-format ingestion, true isosurface extraction, complete OGC compliance or a finished sensor-plugin framework.
