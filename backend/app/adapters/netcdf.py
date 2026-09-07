"""Rectilinear CF-style NetCDF adapter. No frontend assumptions about grid size.

Unsupported grids/units fail explicitly, before replacing the active dataset.
"""

import math
from pathlib import Path

import numpy as np
import xarray as xr

COORDS = {
    "latitude": ("latitude", "lat"),
    "longitude": ("longitude", "lon"),
    "depth": ("depth", "lev", "level", "deptht"),
    "time": ("time", "ocean_time"),
}
ALIASES = {
    "temperature": ("temperature", "thetao", "temp", "water_temp"),
    "salinity": ("salinity", "so", "salt"),
    "chlorophyll": ("chlorophyll", "chl", "chla"),
    "u_current": ("u_current", "uo", "u"),
    "v_current": ("v_current", "vo", "v"),
}
UNITS = {
    "temperature": "°C",
    "salinity": "PSU",
    "chlorophyll": "mg/m³",
    "u_current": "m/s",
    "v_current": "m/s",
    "current_speed": "m/s",
}


def clean(a):
    """JSON null for missing/non-finite model cells; never serialize NaN."""
    values = np.asarray(a)
    return np.where(np.isfinite(values), np.round(values, 5), None).tolist()


class NetCDFDatasetAdapter:
    def __init__(self, path: Path):
        raw = xr.open_dataset(path)
        try:
            rename = {}
            for canonical, candidates in COORDS.items():
                found = next(
                    (n for n in candidates if n in raw.coords or n in raw.dims), None
                )
                if found is None:
                    raise ValueError(
                        f"Required coordinate missing: {canonical}. Use a rectilinear latitude/longitude/depth/time dataset."
                    )
                if found != canonical:
                    rename[found] = canonical
            ds = raw.rename(rename)
            for coord in COORDS:
                if ds[coord].ndim != 1 or ds[coord].dims != (coord,):
                    raise ValueError(
                        f"{coord} must be a one-dimensional coordinate on its own dimension; curvilinear grids need preprocessing."
                    )
                if ds.sizes[coord] < (1 if coord in ("time", "depth") else 2):
                    raise ValueError(f"Insufficient {coord} coordinates.")
            if not np.issubdtype(ds.time.dtype, np.datetime64):
                raise ValueError(
                    "Time must decode to standard-calendar datetime64; convert non-standard calendars first."
                )
            if np.isnat(ds.time.values).any():
                raise ValueError("Time includes invalid dates.")
            for coord in ("depth", "latitude", "longitude"):
                if not np.isfinite(ds[coord]).all():
                    raise ValueError(f"{coord} includes non-finite coordinates.")
            depth_unit = ds.depth.attrs.get("units", "m").lower()
            if depth_unit not in ("m", "meter", "meters", "metre", "metres"):
                raise ValueError(
                    "Depth must be in metres, not pressure or sigma levels."
                )
            if ds.depth.attrs.get("positive", "down") == "up":
                ds = ds.assign_coords(depth=-ds.depth)
            if float(ds.depth.min()) < 0:
                raise ValueError("Depth must be positive downward.")
            ds = ds.assign_coords(longitude=((ds.longitude + 180) % 360) - 180)
            for coord in COORDS:
                if len(np.unique(ds[coord])) != ds.sizes[coord]:
                    raise ValueError(
                        f"Duplicate {coord} coordinates are not supported."
                    )
                ds = ds.sortby(coord)
            if float(ds.latitude.min()) < -90 or float(ds.latitude.max()) > 90:
                raise ValueError("Latitude is outside -90 to 90 degrees.")
            # A regular regional domain is required by the flat scene projection.
            if float(ds.longitude.max() - ds.longitude.min()) > 180:
                raise ValueError(
                    "Please subset global/dateline-crossing data to a regional domain under 180° wide."
                )
            variables = {}
            for canonical, candidates in ALIASES.items():
                name = next((n for n in candidates if n in ds.data_vars), None)
                if name is None:
                    continue
                arr = ds[name]
                if set(arr.dims) != set(COORDS):
                    raise ValueError(
                        f"{name} must have exactly time, depth, latitude, longitude dimensions."
                    )
                unit = (
                    arr.attrs.get("units", "")
                    .lower()
                    .replace(" ", "")
                    .replace("**", "^")
                )
                if canonical == "temperature":
                    if unit in ("k", "kelvin"):
                        arr = arr - 273.15
                    elif unit not in (
                        "degree_celsius",
                        "degrees_celsius",
                        "celsius",
                        "degc",
                        "°c",
                        "c",
                    ):
                        raise ValueError(
                            f"Unsupported temperature units: {unit or 'missing'}"
                        )
                elif canonical in ("u_current", "v_current"):
                    if unit in ("cm/s", "cms-1", "cms^-1"):
                        arr = arr / 100
                    elif unit not in ("m/s", "ms-1", "ms^-1"):
                        raise ValueError(
                            f"Unsupported current units: {unit or 'missing'}"
                        )
                elif canonical == "chlorophyll" and unit not in (
                    "mg/m3",
                    "mg/m³",
                    "mgm-3",
                    "mgm^-3",
                ):
                    raise ValueError("Chlorophyll must be in mg/m³.")
                elif canonical == "salinity" and unit not in (
                    "psu",
                    "1",
                    "1e-3",
                    "ppt",
                    "g/kg",
                ):
                    raise ValueError(
                        "Unsupported salinity units; provide practical salinity (PSU)."
                    )
                variables[canonical] = arr.transpose(
                    "time", "depth", "latitude", "longitude"
                )
            if not variables:
                raise ValueError("No supported ocean variables detected.")
            # Bound memory for local prototype. Subset/downsample larger files before ingestion.
            estimated = sum(v.size * 8 for v in variables.values())
            if estimated > 256 * 1024**2:
                raise ValueError(
                    "Decoded data exceeds 256 MiB. Subset/downsample the NetCDF before loading."
                )
            self.ds = xr.Dataset(variables, attrs=ds.attrs).load()
            if {"u_current", "v_current"} <= set(variables):
                self.ds["current_speed"] = np.hypot(
                    self.ds.u_current, self.ds.v_current
                )
            self.path = path
            self.variables = [
                v for v in self.ds.data_vars if v not in ("u_current", "v_current")
            ]
            self.ranges = {}
            for v in self.variables:
                vals = self.ds[v].values
                finite = vals[np.isfinite(vals)]
                if not finite.size:
                    raise ValueError(f"{v} contains no finite data.")
                self.ranges[v] = [float(finite.min()), float(finite.max())]
        finally:
            raw.close()

    def validate(self, variable, time):
        if variable not in self.ds.data_vars:
            raise ValueError(f"Unknown variable: {variable}")
        if not 0 <= time < self.ds.sizes["time"]:
            raise ValueError("Time index is outside the dataset.")

    def at_depth(self, arr, depth):
        if not math.isfinite(depth) or not float(self.ds.depth.min()) <= depth <= float(
            self.ds.depth.max()
        ):
            raise ValueError("Depth is outside the dataset.")
        if depth in arr.depth:
            return arr.sel(depth=depth)
        return arr.interp(depth=depth)

    @staticmethod
    def downsample(arr, cap=73, depth_cap=32):
        index = {}
        for coord, limit in (
            ("latitude", cap),
            ("longitude", cap),
            ("depth", depth_cap),
        ):
            if coord in arr.dims and arr.sizes[coord] > limit:
                index[coord] = np.unique(
                    np.linspace(0, arr.sizes[coord] - 1, limit).astype(int)
                )
        return arr.isel(index)

    def field(self, variable, time, depth=None):
        self.validate(variable, time)
        arr = self.ds[variable].isel(time=time)
        if depth is not None:
            arr = self.at_depth(arr, depth)
        arr = self.downsample(arr, cap=57 if depth is None else 73)
        finite = arr.values[np.isfinite(arr.values)]
        return {
            "variable": variable,
            "units": UNITS[variable],
            "time": time,
            "timestamp": self.times()[time],
            "depth": depth,
            "depths": arr.depth.values.tolist() if depth is None else [depth],
            "latitudes": arr.latitude.values.tolist(),
            "longitudes": arr.longitude.values.tolist(),
            "values": clean(arr.values),
            "range": [float(finite.min()), float(finite.max())]
            if finite.size
            else [None, None],
        }

    def times(self):
        return [
            str(np.datetime_as_string(t, unit="s")) + "Z" for t in self.ds.time.values
        ]

    def metadata(self):
        return {
            "id": str(self.ds.attrs.get("dataset_id", self.path.stem)),
            "name": str(self.ds.attrs.get("title", self.path.stem)),
            "synthetic": str(self.ds.attrs.get("synthetic", "false")).lower() == "true",
            "grid": dict(self.ds.sizes),
            "bounds": {
                c: [float(self.ds[c].min()), float(self.ds[c].max())]
                for c in ("latitude", "longitude", "depth")
            },
            "variables": [
                {
                    "id": v,
                    "name": v.replace("_", " ").title(),
                    "units": UNITS[v],
                    "range": self.ranges[v],
                }
                for v in self.variables
            ],
            "times": self.times(),
            "depths": self.ds.depth.values.tolist(),
            "has_currents": "current_speed" in self.variables,
        }
