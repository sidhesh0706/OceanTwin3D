import json
from functools import lru_cache
from pathlib import Path

import numpy as np

from backend.app.adapters.netcdf import NetCDFDatasetAdapter, clean
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

    def profile(self, latitude: float, longitude: float, time: int):
        """Full depth profile at a geographic point — all wet variables, all depths."""
        adapter = self.adapter
        ds = adapter.ds
        adapter.validate(adapter.variables[0], time)
        if not float(ds.latitude.min()) <= latitude <= float(ds.latitude.max()):
            raise ValueError("Latitude is outside the dataset domain.")
        # Normalise longitude to dataset range
        lon_norm = ((longitude + 180) % 360) - 180
        if not float(ds.longitude.min()) <= lon_norm <= float(ds.longitude.max()):
            raise ValueError("Longitude is outside the dataset domain.")
        arr = ds.isel(time=time).interp(latitude=latitude, longitude=lon_norm)
        depths = ds.depth.values.tolist()
        result = []
        for i, z in enumerate(depths):
            row = {"depth": float(z)}
            for v in adapter.variables:
                val = float(arr[v].isel(depth=i))
                row[v] = round(val, 5) if np.isfinite(val) else None
            result.append(row)
        return {
            "latitude": latitude,
            "longitude": lon_norm,
            "time": time,
            "timestamp": adapter.times()[time],
            "depths": depths,
            "variables": {v: adapter.metadata()["variables"][adapter.variables.index(v)]["units"]
                          for v in adapter.variables},
            "profiles": result,
        }

    def transect(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
        depth: float,
        time: int,
        variable: str,
        npoints: int = 50,
    ):
        """Sample a variable along a great-circle transect at a fixed depth."""
        adapter = self.adapter
        adapter.validate(variable, time)
        npoints = max(2, min(npoints, 200))
        lats = np.linspace(lat1, lat2, npoints)
        lons = np.linspace(lon1, lon2, npoints)
        # Clamp to domain
        ds = adapter.ds
        lats = np.clip(lats, float(ds.latitude.min()), float(ds.latitude.max()))
        lons = np.clip(lons, float(ds.longitude.min()), float(ds.longitude.max()))
        arr_depth = adapter.at_depth(ds[variable].isel(time=time), depth)
        # Compute cumulative distance along transect (km)
        R = 6371.0
        dlat = np.radians(np.diff(lats))
        dlon = np.radians(np.diff(lons))
        lat_mid = np.radians((lats[:-1] + lats[1:]) / 2)
        dx = np.sqrt((R * dlat) ** 2 + (R * np.cos(lat_mid) * dlon) ** 2)
        dist = np.concatenate([[0.0], np.cumsum(dx)])
        points = []
        for i in range(npoints):
            val = float(arr_depth.interp(latitude=lats[i], longitude=lons[i]))
            points.append({
                "distance_km": round(float(dist[i]), 2),
                "latitude": round(float(lats[i]), 4),
                "longitude": round(float(lons[i]), 4),
                "value": round(val, 5) if np.isfinite(val) else None,
            })
        return {
            "variable": variable,
            "units": adapter.metadata()["variables"][adapter.variables.index(variable)]["units"],
            "depth": depth,
            "time": time,
            "timestamp": adapter.times()[time],
            "total_distance_km": round(float(dist[-1]), 2),
            "points": points,
        }

    def region_stats(
        self,
        lat_min: float,
        lat_max: float,
        lon_min: float,
        lon_max: float,
        depth: float,
        time: int,
        variable: str,
    ):
        """Statistical summary for a rectangular ocean region."""
        adapter = self.adapter
        adapter.validate(variable, time)
        ds = adapter.ds
        arr_depth = adapter.at_depth(ds[variable].isel(time=time), depth)
        region = arr_depth.sel(
            latitude=slice(lat_min, lat_max),
            longitude=slice(lon_min, lon_max),
        )
        vals = region.values
        finite = vals[np.isfinite(vals)]
        if finite.size == 0:
            raise ValueError("No ocean data in selected region.")
        return {
            "variable": variable,
            "units": adapter.metadata()["variables"][adapter.variables.index(variable)]["units"],
            "depth": depth,
            "time": time,
            "timestamp": adapter.times()[time],
            "bounds": {"lat": [lat_min, lat_max], "lon": [lon_min, lon_max]},
            "wet_cells": int(finite.size),
            "total_cells": int(vals.size),
            "mean": round(float(finite.mean()), 5),
            "std": round(float(finite.std()), 5),
            "min": round(float(finite.min()), 5),
            "max": round(float(finite.max()), 5),
            "median": round(float(np.median(finite)), 5),
        }
