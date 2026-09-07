import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from backend.app.adapters.netcdf import NetCDFDatasetAdapter
from backend.app.models import ObservationSource


class OceanService:
    def __init__(self, path: Path, observations_path: Path | None):
        self.adapter = NetCDFDatasetAdapter(path)
        # Per-service cache avoids retaining old datasets after repeated uploads.
        self.field = lru_cache(maxsize=32)(self.adapter.field)
        self.observations = []
        if observations_path and observations_path.exists():
            self.observations = [
                ObservationSource.model_validate(o).model_dump()
                for o in json.loads(observations_path.read_text())
            ]

    def observation(self, instrument_id):
        obs = next((o for o in self.observations if o["id"] == instrument_id), None)
        if obs is None:
            raise KeyError("Instrument not found.")
        return obs

    def compare(self, instrument_id, variable="temperature", time=None):
        obs = self.observation(instrument_id)
        ds = self.adapter.ds
        stamp = np.datetime64(obs["timestamp"].replace("Z", ""))
        time_index = (
            int(np.argmin(np.abs(ds.time.values - stamp))) if time is None else time
        )
        self.adapter.validate(variable, time_index)
        if variable not in ("temperature", "salinity", "chlorophyll"):
            raise ValueError("This instrument has no current-speed profile.")
        arr = ds[variable].isel(time=time_index)
        # Linear horizontal + vertical collocation. No extrapolation or filling across land.
        column = arr.interp(latitude=obs["latitude"], longitude=obs["longitude"])
        rows = []
        errors = []
        for p in obs["profiles"]:
            observed = p.get(variable)
            z = p["depth"]
            if z in column.depth:
                model = float(column.sel(depth=z))
            elif ds.sizes["depth"] > 1:
                model = float(column.interp(depth=z))
            else:
                model = float("nan")
            matched = (
                observed is not None and np.isfinite(observed) and np.isfinite(model)
            )
            rows.append(
                {
                    "depth": z,
                    "observed": observed,
                    "model": round(model, 5) if np.isfinite(model) else None,
                }
            )
            if matched:
                errors.append(model - observed)
        error = np.asarray(errors)
        delta = float((ds.time.values[time_index] - stamp) / np.timedelta64(1, "h"))
        return {
            "instrument_id": instrument_id,
            "variable": variable,
            "units": self.adapter.metadata()["variables"][
                self.adapter.variables.index(variable)
            ]["units"],
            "profiles": rows,
            "method": "Linear latitude/longitude/depth interpolation; selected model timestep. Bias = model − observed.",
            "model_time": self.adapter.times()[time_index],
            "observation_time": obs["timestamp"],
            "time_offset_hours": delta,
            "matched_samples": len(errors),
            "metrics": {
                "mae": float(np.abs(error).mean()),
                "rmse": float(np.sqrt(np.mean(error**2))),
                "bias": float(error.mean()),
            }
            if errors
            else None,
        }
