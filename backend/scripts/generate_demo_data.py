"""Reproducible, explicitly synthetic Indian Ocean model and sensor profiles.

Run from the repository root: python -m backend.scripts.generate_demo_data
No network access is needed. Natural Earth geometry is bundled.
"""

import json
from pathlib import Path

import numpy as np
import xarray as xr
from shapely import contains_xy
from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend/data"
DEPTHS = np.array([0, 10, 25, 50, 100, 200, 500, 1000, 2000], dtype=float)


def generate():
    DATA.mkdir(parents=True, exist_ok=True)
    latitude = np.linspace(-12, 28, 57)
    longitude = np.linspace(45, 100, 73)
    times = np.datetime64("2026-09-02T00:00") + np.arange(13) * np.timedelta64(6, "h")
    source = json.loads((ROOT / "data_sources/ne_110m_land.geojson").read_text())
    region = box(45, -12, 100, 28)
    land = unary_union([shape(f["geometry"]) for f in source["features"]]).intersection(
        region
    )
    land_json = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"source": "Natural Earth 1:110m, public domain"},
                "geometry": mapping(land),
            }
        ],
    }
    (ROOT / "frontend/public/land.geojson").write_text(
        json.dumps(land_json), encoding="utf-8"
    )
    xx, yy = np.meshgrid(longitude, latitude)
    wet = ~contains_xy(land, xx, yy)
    t, d, lat, lon = np.meshgrid(
        np.arange(len(times)), DEPTHS, latitude, longitude, indexing="ij"
    )
    phase = t * 2 * np.pi / 12
    eddy = np.exp(
        -(
            (lon - 66 - 1.8 * np.sin(phase)) ** 2 / 38
            + (lat - 9 - np.cos(phase)) ** 2 / 28
        )
    )
    bay = np.exp(-((lon - 88) ** 2 / 70 + (lat - 17) ** 2 / 50))
    coast = np.exp(-((lon - 54) ** 2 / 30 + (lat - 14) ** 2 / 80))
    surface = (
        28.4
        + 1.5 * np.cos(lat / 13)
        + 1.2 * eddy
        - 2.8 * coast
        + 0.5 * np.sin(lon / 5 + phase)
    )
    temperature = 2.4 + (surface - 2.4) * (
        0.72 * np.exp(-d / 185) + 0.28 * np.exp(-d / 700)
    )
    salinity = 34.65 + (
        1.35 * np.cos((lon - 57) / 23) - 1.2 * bay + 0.12 * np.sin(phase + lat / 6)
    ) * np.exp(-d / 500)
    chlorophyll = 0.025 + (0.15 + 1.4 * coast + 0.85 * bay + 0.35 * eddy) * np.exp(
        -(((d - 45) / 75) ** 2)
    )
    ex, ey = lon - 66 - 1.8 * np.sin(phase), lat - 9 - np.cos(phase)
    u = (-0.115 * ey * eddy + 0.22 * np.sin(lat / 4 + phase) + 0.11) * np.exp(-d / 800)
    v = (0.115 * ex * eddy + 0.17 * np.cos(lon / 5 - phase)) * np.exp(-d / 800)
    arrays = {
        "temperature": (temperature, "degree_Celsius"),
        "salinity": (salinity, "PSU"),
        "chlorophyll": (chlorophyll, "mg m-3"),
        "u_current": (u, "m s-1"),
        "v_current": (v, "m s-1"),
    }
    ds = xr.Dataset(
        {
            name: (
                ("time", "depth", "latitude", "longitude"),
                np.where(wet[None, None], a, np.nan).astype("float32"),
                {"units": unit, "long_name": name.replace("_", " ")},
            )
            for name, (a, unit) in arrays.items()
        },
        coords={
            "time": times,
            "depth": DEPTHS,
            "latitude": latitude,
            "longitude": longitude,
        },
        attrs={
            "title": "OceanTwin Demo Model",
            "dataset_id": "OT-DEMO-IND-001",
            "synthetic": "true",
            "description": "Analytic demonstration fields; not a forecast or measured ocean state.",
            "Conventions": "CF-1.8",
        },
    )
    ds.depth.attrs = {"units": "m", "positive": "down", "axis": "Z"}
    ds.latitude.attrs = {"units": "degrees_north", "standard_name": "latitude"}
    ds.longitude.attrs = {"units": "degrees_east", "standard_name": "longitude"}
    ds.to_netcdf(
        DATA / "demo_ocean.nc",
        engine="netcdf4",
        encoding={v: {"zlib": True, "complevel": 4} for v in arrays},
    )
    locations = [
        (65.5, 12.4),
        (70.2, 8.1),
        (60.1, 3.5),
        (67.5, -2.1),
        (82.7, 6.1),
        (87.2, 12.3),
        (91.4, 8.7),
        (76.1, -6.2),
        (63.3, 17.2),
        (84.8, 10.1),
        (72.1, 3.7),
    ]
    sources = []
    for i, (x, y) in enumerate(locations):
        sensor_type = "ARGO" if i < 8 else "GLIDER"
        z = DEPTHS if sensor_type == "ARGO" else DEPTHS[DEPTHS <= 1000]
        profile = ds.isel(time=4).interp(
            latitude=xr.DataArray(y), longitude=xr.DataArray(x), depth=z
        )
        rows = []
        for j, depth in enumerate(z):
            rows.append(
                {
                    "depth": float(depth),
                    "temperature": round(
                        float(profile.temperature[j])
                        + 0.35 * np.sin(j * 0.8 + i)
                        + 0.12,
                        4,
                    ),
                    "salinity": round(
                        float(profile.salinity[j]) + 0.055 * np.cos(j + i) - 0.012, 4
                    ),
                    "chlorophyll": round(
                        max(
                            0.001,
                            float(profile.chlorophyll[j]) * (1 + 0.09 * np.sin(i + j)),
                        ),
                        4,
                    ),
                }
            )
        sources.append(
            {
                "id": f"ARGO-{2902487 + i}" if i < 8 else f"GLIDER-IO-{i - 7:02d}",
                "instrument_type": sensor_type,
                "latitude": y,
                "longitude": x,
                "timestamp": str(times[4]) + "Z",
                "synthetic": True,
                "profiles": rows,
            }
        )
    (DATA / "observations.json").write_text(
        json.dumps(sources, indent=2, allow_nan=False), encoding="utf-8"
    )
    print(
        f"Generated {dict(ds.sizes)} and {len(sources)} synthetic instruments in {DATA}"
    )


if __name__ == "__main__":
    generate()
