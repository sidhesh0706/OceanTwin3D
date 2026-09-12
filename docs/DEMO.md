# Presentation rehearsal — 10 September 2026

## Start before entering the room

1. Open the repository root in PyCharm.
2. Select the project interpreter: `.venv/Scripts/python.exe`.
3. Run `run.py` and open [OceanTwin directly](http://127.0.0.1:8000/?explore).
4. Confirm **System Ready**, **DEMO DATA**, and **NASA Blue Marble (local)**.
5. Keep the laptop plugged in and use a hardware-accelerated browser. Use the browser's normal zoom. Test the projector layout before speaking.
6. On a fresh laptop, run `python setup_project.py` while online first. Normal default operation then uses local files.

The default page opens a clean introduction around the actual NASA-textured explorer globe. Select **Explore the ocean** to reveal the workspace without replacing the globe or resetting its position. Use `/?explore` to skip the intro, or [the intro](http://127.0.0.1:8000/?intro) for the presentation opening. The local ocean includes a Reset view button and screen-space depth labels.

## Five-minute walkthrough

| Time | Action | What to say |
| --- | --- | --- |
| 0:00–0:40 | Start on the Indian Ocean globe. Rotate it; use View → Earth or Pacific, then Indian. | “OceanTwin brings location, depth, time and instrument profiles into one workspace. These are explicitly synthetic demonstration data.” |
| 0:40–1:30 | Click an Indian Ocean Argo marker, or select one from Observations. Use Top-down, then 3D ocean. Move Depth from 0 to 500, then 2000 m. | “We move from Earth into a broad local ocean section. Coastlines preserve geographic context, while the slice and side sections expose the model water column. Values between model levels are interpolated.” |
| 1:30–2:00 | Select 3D Volume. Open Depth and try the scale controls, then return to Depth slice and depth 0. | “This is a schematic stack of model depth layers. Vertical exaggeration is displayed; this is not literal planetary-scale bathymetry.” |
| 2:00–2:30 | Choose Current Speed or Current field. Press Play, observe one or two frames, then pause. | “The vectors follow the model's u/v field at the chosen depth. Motion is accelerated to make the flow readable.” |
| 2:30–3:20 | Expand Observations in the right panel and choose an Argo float. Enable Compare with model. Select model frame 7 (12 February) for matching dates. | “We interpolate the model at the instrument position and depth and calculate RMSE, MAE and bias. The timestamps show whether the comparison is time-aligned.” |
| 3:20–4:00 | Close the inspector. Analysis → Profile Probe. Use A latitude 5, longitude 65, then Run analysis. | “A probe returns all variables through the water column, with depth increasing downward.” |
| 4:00–4:35 | Close analysis. Analysis → Transect. A=(5,65), B=(15,85), depth 0, Temperature; Run analysis. | “This chart samples a great-circle path at one selected depth. Missing sections stay missing.” |
| 4:35–5:00 | Analysis → Region Stats with the same corners, then Run analysis. | “We summarize the finite model cells in the selected rectangle. This prototype demonstrates the workflow needed to connect real model and observation sources.” |

For a Pacific seam demonstration, use transect A=(0,170), B=(0,-170). The route should be about **2,224 km**, crossing the short dateline arc.

Model frames use zero-based indices internally: frame 7 on screen is index 6, the observation date. Profiles and comparisons are synthetic and do not prove forecast skill.

## Useful controls

- **View**: geographic basin and depth camera presets.
- **Layers / Scientific variable**: temperature, salinity, chlorophyll, current speed.
- **Depth**: interpolation, opacity, labelled vertical scale.
- **Analysis**: real probe, transect and region results; coordinate inputs also work without map clicking.
- **Settings**: sensor/current/grid toggles, color limits, particle density, NetCDF upload.
- **Observations**: expandable selectable instrument list.
- **Earth imagery / Ocean overlay**: keep the natural globe visible or display the selected scientific field.
- **Back to Earth / Top-down / 3D ocean**: move between the globe, flat ocean map and angled water column.
- **P**: presentation mode. **Space**: play/pause when focus is on the page. **Esc**: exit overlays.
- **Demo Tour**: short automated overview; stop it before answering detailed questions.

## Recovery

- If data are still updating, wait for **System Ready**. The old frame remains visible with a loading notice.
- If the globe fails, reload once. Ensure the production build exists and hardware acceleration is enabled.
- If the service is unavailable, run `run.py` again in PyCharm. For changed frontend source, rebuild inside `frontend` first.
- To reset an uploaded model, use **Settings → Restore demo model**, or restart the service.
- A coastal/land probe can return no wet data. Use the rehearsal coordinates above.
- For a slower laptop, choose **Settings → Particle density → Low** and disable current vectors when discussing scalar fields.
- Do not introduce a new NetCDF file during the presentation unless rehearsed beforehand.

## Claims to keep precise

This is a local prototype with synthetic fields and profiles. It does not provide a live INCOIS feed, production forecasting, assimilation or operational decisions. Region means are unweighted grid-cell means. Transects are fixed-depth sections. The isosurface view is a threshold-band preview. Coarse-grid coastal gaps and the absence of data poleward of ±75° are visible limitations.

## UI verification — 12 September 2026

The premium OceanTwin splash replays on every page refresh. The default route then shows a compact introduction around the same NASA-textured globe used by the explorer; entering reveals the workspace without replacing its Cesium viewer. The direct `/?explore` route skips the introduction after the splash.

Open left toolbar panels reserve separate space below the scene navigation controls. Local ocean framing no longer resets just because a new time/depth frame arrives. Model context and the updating indicator follow the displayed regional frame.

Validation: production TypeScript/Vite build; 28 backend tests and 3 frontend numerical tests passed. Browser checks covered refresh/entry, Argo selection and profile metrics, flat ocean rendering, time stepping, variable changes, volume/current modes, presentation mode, transect and regional statistics. NetCDF ingestion, atomic replacement, missing data and scientific calculations are covered by backend tests. Two existing dependency warnings remain (AnyIO deprecation and NumPy native layout warning); they did not fail tests. Device-specific GPU performance and projector appearance still require a rehearsal on the presentation machine. Demo scientific data is synthetic.
