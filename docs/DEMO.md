# Two-minute jury demonstration

Open the viewer before presenting. Leave the synthetic-data label visible. Use the built frontend at port 8000 for an offline demo.

1. **Surface, 0:00–0:15:** “Ocean models produce enormous four-dimensional datasets. OceanTwin lets us explore those dimensions together.” Rotate the regional scene. Point out India, the coastline, currents, and depth ruler.
2. **Descend, 0:15–0:35:** Select 500 m. “We can move below the surface and inspect the thermocline.” The plane descends and temperature changes. Click a wet part of the slice for coordinates and local values.
3. **Volume, 0:35–0:55:** Select 3D volume and rotate. “These are nine depth-resolved model layers, from warm surface waters to the deep ocean.” Adjust vertical display scale if useful; explain that depth is exaggerated for readability.
4. **Currents and time, 0:55–1:15:** Select Current field, return to SFC, and play the timeline. “The streaks follow model eastward and northward currents. We can also inspect how the field evolves.” Motion is accelerated for visibility.
5. **Observation, 1:15–1:35:** Pause at 3 September 00:00 UTC (frame 5). Click an Argo marker. “This synthetic instrument profile demonstrates how a real Argo or glider record would appear in the same scene.” Depth increases downward in the chart.
6. **Comparison, 1:35–1:55:** Enable Compare with model. Show both curves and RMSE/MAE/bias. “The model is interpolated to the observation location and depths, and these errors are calculated from the actual displayed pairs.” At frame 5 the model and profile times align.
7. **Close, 1:55–2:00:** “The prototype proves the exploration and collocation pipeline. The next milestone is validating it with real INCOIS fields and quality-controlled observations.”

`P` toggles presentation mode. Select a marker to retain the inspector there. **Demo tour** runs a shorter automated five-stage version; stop it before using manual controls. It has no narration.
