"""Reproducible, explicitly synthetic GLOBAL ocean model and sensor profiles.

Run from the repository root: python -m backend.scripts.generate_demo_data
No network access is needed. Natural Earth geometry is bundled.
"""

import json
from pathlib import Path

import numpy as np
import xarray as xr
from shapely import contains_xy
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "backend/data"
DEPTHS = np.array([0, 10, 25, 50, 100, 200, 500, 1000, 2000], dtype=float)

# Global grid at 2.5° resolution — 144×62 cells (~20 MB uncompressed, well under 256 MB limit)
LAT_POINTS = 62
LON_POINTS = 144
NTIME = 13  # weekly steps, 3-month window


def generate():
    DATA.mkdir(parents=True, exist_ok=True)

    latitude = np.linspace(-75.0, 75.0, LAT_POINTS)
    longitude = np.linspace(-177.5, 177.5, LON_POINTS)
    times = np.datetime64("2026-01-01T00:00") + np.arange(NTIME) * np.timedelta64(7, "D")

    # ── Land mask from bundled Natural Earth geometry ─────────────────────
    source = json.loads((ROOT / "data_sources/ne_110m_land.geojson").read_text())
    land = unary_union([shape(f["geometry"]) for f in source["features"]])

    # Copy world-land to frontend public for the offline Earth renderer
    world_dest = ROOT / "frontend/public/world-land.geojson"
    if not world_dest.exists():
        world_dest.write_text(
            json.dumps({"type": "FeatureCollection", "features": source["features"]}),
            encoding="utf-8",
        )

    xx, yy = np.meshgrid(longitude, latitude)
    # wet[j, i] = True where ocean
    wet = ~contains_xy(land, xx, yy)

    # ── Broadcast arrays (time, depth, lat, lon) ─────────────────────────
    t_idx = np.arange(NTIME)
    phase = (t_idx[:, None, None, None] * 2 * np.pi / NTIME).astype("float32")  # seasonal
    lat4 = latitude[None, None, :, None].astype("float32")
    lon4 = longitude[None, None, None, :].astype("float32")
    dep4 = DEPTHS[None, :, None, None].astype("float32")

    # ── Surface Temperature: realistic global SST ─────────────────────────
    # Base: warm tropics (~29°C), cold poles (~-1°C)
    sst_base = 28.0 * np.exp(-((lat4 / 38) ** 2)) - 1.0 * (np.abs(lat4) / 75)

    # Indo-Pacific warm pool
    warm_pool = 1.8 * np.exp(-((lon4 - 130) ** 2 / 3600 + (lat4 - 5) ** 2 / 500))

    # Cold upwelling systems
    peru = -3.2 * np.exp(-((lon4 + 80) ** 2 / 200 + (lat4 + 12) ** 2 / 350))
    benguela = -2.8 * np.exp(-((lon4 - 14) ** 2 / 120 + (lat4 + 22) ** 2 / 250))
    california = -2.0 * np.exp(-((lon4 + 125) ** 2 / 150 + (lat4 - 35) ** 2 / 300))
    somalia = -2.2 * np.exp(-((lon4 - 52) ** 2 / 180 + (lat4 - 10) ** 2 / 300))

    # Western boundary currents (warm tongues)
    gulf_stream = 2.5 * np.exp(-((lon4 + 65) ** 2 / 350 + (lat4 - 38) ** 2 / 200))
    kuroshio = 2.2 * np.exp(-((lon4 - 148) ** 2 / 280 + (lat4 - 32) ** 2 / 180))
    agulhas = 1.8 * np.exp(-((lon4 - 30) ** 2 / 200 + (lat4 + 35) ** 2 / 200))

    # Mediterranean heat
    med = 1.5 * np.exp(-((lon4 - 20) ** 2 / 400 + (lat4 - 37) ** 2 / 80))

    sst_static = sst_base + warm_pool + peru + benguela + california + somalia + gulf_stream + kuroshio + agulhas + med

    # Seasonal cycle: stronger in mid-latitudes, phase-reversed hemispheres
    seasonal_t = 3.5 * np.cos(lat4 / 32) * np.cos(phase)
    surface_t = sst_static + seasonal_t  # shape: (T, 1, lat, lon)

    # Depth thermocline profile
    temperature = 1.8 + (surface_t - 1.8) * (
        0.70 * np.exp(-dep4 / 175) + 0.30 * np.exp(-dep4 / 720)
    )

    # ── Salinity ──────────────────────────────────────────────────────────
    # Subtropical highs (evaporation > precipitation), equatorial low
    sal_subtropical = 0.85 * np.cos(2 * np.radians(lat4))
    sal_equatorial = -0.55 * np.exp(-((lat4 / 18) ** 2))
    sal_pacific_fresh = -0.45 * np.exp(-((lon4 - 200) ** 2 / 10000 + (lat4 / 40) ** 2))
    sal_med = 0.6 * np.exp(-((lon4 - 20) ** 2 / 300 + (lat4 - 37) ** 2 / 80))
    sal_red = 0.8 * np.exp(-((lon4 - 39) ** 2 / 120 + (lat4 - 20) ** 2 / 200))
    sal_arctic = -0.7 * np.exp(-((lat4 - 70) ** 2 / 200))

    sal_surface = 34.8 + sal_subtropical + sal_equatorial + sal_pacific_fresh + sal_med + sal_red + sal_arctic
    seasonal_s = 0.08 * np.cos(lat4 / 28) * np.cos(phase + np.pi)
    salinity = (sal_surface + seasonal_s) * np.exp(-dep4 / 650) + 34.65 * (1.0 - np.exp(-dep4 / 650))

    # ── Chlorophyll ───────────────────────────────────────────────────────
    # Peaks: polar fronts, upwelling, coastal; minima: subtropical gyres
    chl_polar = 0.55 * np.exp(-((np.abs(lat4) - 55) ** 2 / 180))
    chl_equatorial = 0.12 * np.exp(-((lat4 / 7) ** 2))
    chl_peru = 0.9 * np.exp(-((lon4 + 80) ** 2 / 200 + (lat4 + 12) ** 2 / 350))
    chl_benguela = 0.7 * np.exp(-((lon4 - 14) ** 2 / 120 + (lat4 + 22) ** 2 / 250))
    chl_california = 0.6 * np.exp(-((lon4 + 125) ** 2 / 150 + (lat4 - 35) ** 2 / 300))
    chl_somali = 0.45 * np.exp(-((lon4 - 52) ** 2 / 180 + (lat4 - 10) ** 2 / 300))
    chl_gyre_low = -0.07 * np.exp(-((lon4 + 30) ** 2 / 5000 + (lat4 - 30) ** 2 / 1200))

    chl_surf = np.maximum(0.01, 0.07 + chl_polar + chl_equatorial + chl_peru + chl_benguela + chl_california + chl_somali + chl_gyre_low)
    seasonal_c = 0.35 * chl_surf * np.maximum(0.0, np.cos(lat4 / 25) * np.cos(phase))
    chlorophyll = np.maximum(0.001, (chl_surf + seasonal_c) * np.exp(-(((dep4 - 25) / 55) ** 2)))

    # ── Currents (simplified global gyre system) ──────────────────────────
    lat_r = np.radians(lat4)

    # Trade winds + westerlies
    u_zonal = -0.12 * np.cos(lat_r)  # trade winds
    u_mid = 0.07 * np.sin(2 * lat_r)  # westerlies

    def gyre(clat, clon, str_u, str_v, lat_scale, lon_scale):
        """Simple elliptical gyre circulation."""
        g = np.exp(-((lat4 - clat) ** 2 / lat_scale + (lon4 - clon) ** 2 / lon_scale))
        u_g = -str_u * g * (lat4 - clat) / np.sqrt(lat_scale)
        v_g = str_v * g * (lon4 - clon) / np.sqrt(lon_scale)
        return u_g, v_g

    u_na, v_na = gyre(32, -40, 0.28, 0.28, 700, 4000)   # N. Atlantic
    u_sa, v_sa = gyre(-28, -22, -0.22, -0.22, 550, 3500)  # S. Atlantic
    u_np, v_np = gyre(28, 175, 0.25, 0.25, 700, 9000)    # N. Pacific
    u_sp, v_sp = gyre(-25, 200, -0.20, -0.20, 600, 8000)  # S. Pacific
    u_io, v_io = gyre(-15, 75, -0.18, 0.18, 600, 2500)   # Indian Ocean

    # Antarctic Circumpolar Current
    u_acc = 0.22 * np.exp(-((lat4 + 58) ** 2 / 180)) * np.ones_like(lon4)
    v_acc = 0.04 * np.sin(np.radians(lon4)) * np.exp(-((lat4 + 58) ** 2 / 180))

    # Seasonal monsoon reversal in Indian Ocean
    u_mon = 0.15 * np.exp(-((lon4 - 72) ** 2 / 1500 + (lat4 - 8) ** 2 / 400)) * np.sin(phase)
    v_mon = 0.12 * np.exp(-((lon4 - 72) ** 2 / 1500 + (lat4 - 8) ** 2 / 400)) * np.cos(phase)

    u = (u_zonal + u_mid + u_na + u_sa + u_np + u_sp + u_io + u_acc + u_mon) * np.exp(-dep4 / 800)
    v = (v_na + v_sa + v_np + v_sp + v_io + v_acc + v_mon) * np.exp(-dep4 / 800)

    # ── Apply wet mask ────────────────────────────────────────────────────
    wet4 = wet[None, None, :, :]  # broadcast (T, D, lat, lon)

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
                np.where(wet4, a, np.nan).astype("float32"),
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
            "title": "OceanTwin Global Demo Model",
            "dataset_id": "OT-DEMO-GLOBAL-001",
            "synthetic": "true",
            "description": "Analytic global demonstration fields across all ocean basins; NOT a forecast or measured ocean state.",
            "Conventions": "CF-1.8",
        },
    )
    ds.depth.attrs = {"units": "m", "positive": "down", "axis": "Z"}
    ds.latitude.attrs = {"units": "degrees_north", "standard_name": "latitude", "axis": "Y"}
    ds.longitude.attrs = {"units": "degrees_east", "standard_name": "longitude", "axis": "X"}
    ds.to_netcdf(
        DATA / "demo_ocean.nc",
        engine="netcdf4",
        encoding={v: {"zlib": True, "complevel": 4} for v in arrays},
    )

    # ── Synthetic observations spread across all major basins ─────────────
    # (lat, lon, type) pairs — one per basin/feature
    obs_locations = [
        # Pacific
        (-8.0, -140.0, "ARGO"),
        (15.0, -175.0, "ARGO"),
        (-35.0, -150.0, "ARGO"),
        (40.0, 160.0, "ARGO"),
        (-55.0, 175.0, "ARGO"),
        # Atlantic
        (35.0, -55.0, "ARGO"),
        (-15.0, -25.0, "ARGO"),
        (55.0, -30.0, "ARGO"),
        (-40.0, -10.0, "ARGO"),
        (10.0, -45.0, "ARGO"),
        # Indian Ocean
        (-10.0, 75.0, "ARGO"),
        (10.0, 65.0, "ARGO"),
        (-25.0, 85.0, "ARGO"),
        (-40.0, 60.0, "ARGO"),
        # Southern Ocean
        (-62.0, -30.0, "ARGO"),
        (-60.0, 80.0, "ARGO"),
        (-58.0, 170.0, "ARGO"),
        # Gliders in key upwelling/frontal regions
        (-15.0, -80.0, "GLIDER"),
        (-25.0, 14.0, "GLIDER"),
        (-12.0, 50.0, "GLIDER"),
        (38.0, -70.0, "GLIDER"),
        (32.0, 145.0, "GLIDER"),
    ]

    time_idx = NTIME // 2  # middle timestep for profile
    sources = []
    for k, (y, x, sensor_type) in enumerate(obs_locations):
        # Snap to nearest grid point
        lat_idx = int(np.argmin(np.abs(latitude - y)))
        lon_idx = int(np.argmin(np.abs(longitude - x)))
        snap_lat = float(latitude[lat_idx])
        snap_lon = float(longitude[lon_idx])

        # Check this is a wet point
        if not wet[lat_idx, lon_idx]:
            # Shift slightly
            for dlat in range(-2, 3):
                for dlon in range(-2, 3):
                    jj = np.clip(lat_idx + dlat, 0, LAT_POINTS - 1)
                    ii = np.clip(lon_idx + dlon, 0, LON_POINTS - 1)
                    if wet[jj, ii]:
                        snap_lat = float(latitude[jj])
                        snap_lon = float(longitude[ii])
                        lat_idx, lon_idx = jj, ii
                        break
                else:
                    continue
                break

        if not wet[lat_idx, lon_idx]:
            continue  # skip if still on land

        z_depths = DEPTHS if sensor_type == "ARGO" else DEPTHS[DEPTHS <= 1000]
        profile_ds = ds.isel(time=time_idx)

        rows = []
        for depth_val in z_depths:
            try:
                pt = profile_ds.interp(
                    latitude=xr.DataArray(snap_lat),
                    longitude=xr.DataArray(snap_lon),
                    depth=xr.DataArray(depth_val),
                )
                seed = k * 1000 + int(depth_val)
                rng = np.random.default_rng(seed)
                row = {"depth": float(depth_val)}
                for var in ["temperature", "salinity", "chlorophyll"]:
                    val = float(pt[var])
                    if np.isfinite(val):
                        noise_scale = {"temperature": 0.30, "salinity": 0.04, "chlorophyll": 0.05}[var]
                        row[var] = round(val + rng.normal(0, noise_scale), 4)
                    else:
                        row[var] = None
                rows.append(row)
            except Exception:
                continue

        if not rows:
            continue

        obs_id = f"ARGO-{5900000 + k}" if sensor_type == "ARGO" else f"GLIDER-GL-{k:02d}"
        sources.append(
            {
                "id": obs_id,
                "instrument_type": sensor_type,
                "latitude": snap_lat,
                "longitude": snap_lon,
                "timestamp": str(times[time_idx]) + "Z",
                "synthetic": True,
                "profiles": [r for r in rows if any(r.get(v) is not None for v in ["temperature", "salinity"])],
            }
        )

    (DATA / "observations.json").write_text(
        json.dumps(sources, indent=2, allow_nan=False), encoding="utf-8"
    )
    print(
        f"Generated global demo: {dict(ds.sizes)}, "
        f"{len(sources)} instruments across all ocean basins -> {DATA}"
    )


if __name__ == "__main__":
    generate()
