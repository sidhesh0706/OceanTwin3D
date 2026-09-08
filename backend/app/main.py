"""OceanTwin API and optional built frontend. Run: python run.py"""

import logging
import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from threading import RLock
from typing import Annotated

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles

from backend.app.adapters.netcdf import clean
from backend.app.services.ocean import OceanService

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
lock = RLock()
logger = logging.getLogger(__name__)
service: OceanService | None = None
load_error: str | None = None


@asynccontextmanager
async def lifespan(_app):
    global service, load_error
    try:
        path = Path(os.environ.get("OCEANTWIN_DATASET", ROOT / "data/demo_ocean.nc"))
        if not path.exists() and "OCEANTWIN_DATASET" not in os.environ:
            from backend.scripts.generate_demo_data import generate

            generate()
        observations = (
            Path(os.environ["OCEANTWIN_OBSERVATIONS"])
            if "OCEANTWIN_OBSERVATIONS" in os.environ
            else (
                ROOT / "data/observations.json"
                if "OCEANTWIN_DATASET" not in os.environ
                else None
            )
        )
        service = OceanService(path, observations)
        load_error = None
    except Exception as exc:
        load_error = str(exc)
        logger.exception("Ocean dataset failed to load")
    yield


app = FastAPI(title="OceanTwin", version="2.0.0", lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


def get_service():
    with lock:
        if service is None:
            raise HTTPException(
                503, f"Ocean dataset unavailable: {load_error or 'initializing'}"
            )
        return service


def safe(fn):
    try:
        return fn()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc


# ── Core metadata ──────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {
        "status": "ready" if service else "unavailable",
        "dataset_loaded": service is not None,
        "detail": load_error,
    }


@app.get("/api/datasets")
def datasets():
    return [get_service().adapter.metadata()]


@app.get("/api/variables")
def variables():
    return get_service().adapter.metadata()["variables"]


@app.get("/api/times")
def times():
    return get_service().adapter.times()


@app.get("/api/depths")
def depths():
    return get_service().adapter.ds.depth.values.tolist()


# ── Ocean field endpoints ──────────────────────────────────────────────────

@app.get("/api/ocean/slice")
def ocean_slice(
    variable: str = "temperature",
    depth: float = Query(0, ge=0),
    time: int = Query(0, ge=0),
):
    return safe(lambda: get_service().field(variable, time, depth))


@app.get("/api/ocean/volume")
def volume(variable: str = "temperature", time: int = Query(0, ge=0)):
    return safe(lambda: get_service().field(variable, time))


@app.get("/api/ocean/inspect")
def inspect(
    latitude: float,
    longitude: float,
    depth: float = Query(0, ge=0),
    time: int = Query(0, ge=0),
):
    def extract():
        adapter = get_service().adapter
        adapter.validate(adapter.variables[0], time)
        if not float(adapter.ds.latitude.min()) <= latitude <= float(
            adapter.ds.latitude.max()
        ) or not float(adapter.ds.longitude.min()) <= longitude <= float(
            adapter.ds.longitude.max()
        ):
            raise ValueError("Position is outside the model domain.")
        arr = adapter.at_depth(adapter.ds.isel(time=time), depth).interp(
            latitude=latitude, longitude=longitude
        )
        return {
            "latitude": latitude,
            "longitude": longitude,
            "depth": depth,
            "values": {v: clean(float(arr[v])) for v in adapter.variables},
        }

    return safe(extract)


@app.get("/api/ocean/profile")
def ocean_profile(
    latitude: float,
    longitude: float,
    time: int = Query(0, ge=0),
):
    """Full depth profile for all variables at a geographic point."""
    return safe(lambda: get_service().profile(latitude, longitude, time))


@app.get("/api/ocean/transect")
def ocean_transect(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
    depth: float = Query(0, ge=0),
    time: int = Query(0, ge=0),
    variable: str = "temperature",
    points: int = Query(50, ge=2, le=200),
):
    """Sample a variable along a great-circle transect at fixed depth."""
    return safe(
        lambda: get_service().transect(lat1, lon1, lat2, lon2, depth, time, variable, points)
    )


@app.get("/api/ocean/stats")
def ocean_stats(
    lat_min: float,
    lat_max: float,
    lon_min: float,
    lon_max: float,
    depth: float = Query(0, ge=0),
    time: int = Query(0, ge=0),
    variable: str = "temperature",
):
    """Statistical summary for a rectangular ocean region."""
    return safe(
        lambda: get_service().region_stats(lat_min, lat_max, lon_min, lon_max, depth, time, variable)
    )


# ── Currents ───────────────────────────────────────────────────────────────

@app.get("/api/currents")
def currents(depth: float = Query(0, ge=0), time: int = Query(0, ge=0)):
    def extract():
        adapter = get_service().adapter
        adapter.validate("current_speed", time)
        arr = adapter.downsample(
            adapter.at_depth(
                adapter.ds[["u_current", "v_current"]].isel(time=time), depth
            ),
            cap=37,
        )
        return {
            "depth": depth,
            "time": time,
            "latitudes": arr.latitude.values.tolist(),
            "longitudes": arr.longitude.values.tolist(),
            "u": clean(arr.u_current.values),
            "v": clean(arr.v_current.values),
            "units": "m/s",
        }

    return safe(extract)


# ── Observations ───────────────────────────────────────────────────────────

@app.get("/api/observations")
def observations():
    return [
        {k: v for k, v in o.items() if k != "profiles"}
        | {"max_depth": max((p["depth"] for p in o["profiles"]), default=0)}
        for o in get_service().observations
    ]


@app.get("/api/observations/{instrument_id}")
def observation(instrument_id: str):
    return safe(lambda: get_service().observation(instrument_id))


@app.get("/api/compare/{instrument_id}")
def compare(
    instrument_id: str,
    variable: str = "temperature",
    time: int | None = Query(None, ge=0),
):
    return safe(lambda: get_service().compare(instrument_id, variable, time))


# ── Dataset management ────────────────────────────────────────────────────

@app.post("/api/datasets/upload")
def upload(file: Annotated[UploadFile, File()]):
    global service, load_error
    if not (file.filename or "").lower().endswith(".nc"):
        raise HTTPException(422, "Select a NetCDF .nc file.")
    upload_dir = ROOT / "data/uploads"
    upload_dir.mkdir(exist_ok=True)
    path = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=upload_dir, suffix=".nc", delete=False
        ) as dest:
            path = Path(dest.name)
            size = 0
            while chunk := file.file.read(1024 * 1024):
                size += len(chunk)
                if size > 64 * 1024**2:
                    raise HTTPException(
                        413, "Upload limit is 64 MiB. Subset the model first."
                    )
                dest.write(chunk)
        candidate = OceanService(path, None)
        with lock:
            service = candidate
            load_error = None
        return candidate.adapter.metadata()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(422, f"Could not load dataset: {exc}") from exc
    finally:
        file.file.close()
        if path:
            path.unlink(missing_ok=True)


@app.post("/api/datasets/demo")
def restore_demo():
    global service, load_error
    candidate = OceanService(
        ROOT / "data/demo_ocean.nc", ROOT / "data/observations.json"
    )
    with lock:
        service, load_error = candidate, None
    return candidate.adapter.metadata()


if (REPO / "frontend/dist").exists():
    app.mount(
        "/", StaticFiles(directory=REPO / "frontend/dist", html=True), name="frontend"
    )
