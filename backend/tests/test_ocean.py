import json
from pathlib import Path

import numpy as np
import pytest
import xarray as xr
from fastapi.testclient import TestClient

from backend.app.adapters.netcdf import NetCDFDatasetAdapter
from backend.app.main import app
from backend.app.services.ocean import OceanService

DATA = Path(__file__).resolve().parents[1] / "data"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def model():
    return OceanService(DATA / "demo_ocean.nc", DATA / "observations.json")


def test_metadata_and_bundled_data(client):
    assert client.get("/api/health").json()["dataset_loaded"] is True
    meta = client.get("/api/datasets").json()[0]
    assert meta["synthetic"] is True
    assert meta["grid"] == {"time": 13, "depth": 9, "latitude": 62, "longitude": 144}
    assert len(client.get("/api/times").json()) == 13
    assert len(client.get("/api/depths").json()) == 9
    assert len(client.get("/api/variables").json()) == 4


@pytest.mark.parametrize(
    "variable", ["temperature", "salinity", "chlorophyll", "current_speed"]
)
def test_fields_finite_or_null_and_bounded(client, variable):
    for route in ("slice", "volume"):
        response = client.get(
            f"/api/ocean/{route}",
            params={"variable": variable, "depth": 500, "time": 4},
        )
        assert response.status_code == 200
        assert "NaN" not in response.text and "Infinity" not in response.text
        field = response.json()
        assert len(field["latitudes"]) <= 100 and len(field["longitudes"]) <= 150
        assert len(response.content) < 1_500_000
        values = np.asarray(field["values"], dtype=float)
        assert np.isfinite(values).any() and np.isnan(values).any()  # Land is masked.
        assert values.ndim == (3 if route == "volume" else 2)


def test_depth_interpolation_and_temporal_variation(model):
    adapter = model.adapter
    f0 = np.asarray(adapter.field("temperature", 0, 0)["values"], dtype=float)
    deep = np.asarray(adapter.field("temperature", 0, 500)["values"], dtype=float)
    later = np.asarray(adapter.field("temperature", 3, 0)["values"], dtype=float)
    assert np.nanmean(f0 - deep) > 5
    assert np.nanmax(np.abs(f0 - later)) > 0.1
    a = np.asarray(adapter.field("temperature", 0, 100)["values"], dtype=float)
    b = np.asarray(adapter.field("temperature", 0, 200)["values"], dtype=float)
    mid = np.asarray(adapter.field("temperature", 0, 150)["values"], dtype=float)
    np.testing.assert_allclose(mid, (a + b) / 2, atol=1e-5, equal_nan=True)


@pytest.mark.parametrize(
    "query",
    ["variable=missing", "time=99", "depth=2500", "depth=-1", "depth=nan", "time=-1"],
)
def test_invalid_queries(client, query):
    assert client.get(f"/api/ocean/slice?{query}").status_code == 422


def test_currents_inspection_and_instruments(client):
    field = client.get("/api/currents?depth=50&time=2").json()
    assert np.asarray(field["u"]).shape == np.asarray(field["v"]).shape
    assert len(field["latitudes"]) <= 62
    obs = client.get("/api/observations").json()
    assert sum(o["instrument_type"] == "ARGO" for o in obs) >= 8
    assert sum(o["instrument_type"] == "GLIDER" for o in obs) >= 3
    for o in obs:
        assert client.get(f"/api/observations/{o['id']}").status_code == 200
    assert client.get("/api/observations/absent").status_code == 404
    values = client.get(
        "/api/ocean/inspect?latitude=12.4&longitude=65.5&depth=500"
    ).json()["values"]
    assert 2 < values["temperature"] < 30
    assert (
        client.get("/api/ocean/inspect?latitude=80&longitude=65.5").status_code == 422
    )


def test_comparison_metrics_against_independent_numpy(client):
    obs = client.get("/api/observations").json()
    for sensor in obs:
        for variable in ("temperature", "salinity", "chlorophyll"):
            result = client.get(
                f"/api/compare/{sensor['id']}?variable={variable}"
            ).json()
            assert result["time_offset_hours"] == 0
            assert result["matched_samples"] == len(result["profiles"])
            residuals = np.array(
                [p["model"] - p["observed"] for p in result["profiles"]]
            )
            assert result["metrics"]["bias"] == pytest.approx(
                residuals.mean(), abs=1e-5
            )
            assert result["metrics"]["mae"] == pytest.approx(
                np.abs(residuals).mean(), abs=1e-5
            )
            assert result["metrics"]["rmse"] == pytest.approx(
                np.sqrt(np.mean(residuals**2)), abs=1e-5
            )
    assert (
        "time_offset_hours"
        in client.get(f"/api/compare/{obs[0]['id']}?time=0").json()
    )


def test_analysis_endpoints(client):
    # Transect
    transect = client.get(
        "/api/ocean/transect",
        params={
            "lat1": 0.0,
            "lon1": 60.0,
            "lat2": 10.0,
            "lon2": 70.0,
            "variable": "temperature",
            "points": 10,
        },
    )
    assert transect.status_code == 200
    t_data = transect.json()
    assert len(t_data["points"]) == 10
    assert t_data["depth"] == 0
    assert t_data["variable"] == "temperature"

    # Profile
    profile = client.get(
        "/api/ocean/profile",
        params={"latitude": 0.0, "longitude": 60.0},
    )
    assert profile.status_code == 200
    p_data = profile.json()
    assert len(p_data["depths"]) == 9
    assert len(p_data["profiles"]) == 9

    # Region stats
    stats = client.get(
        "/api/ocean/stats",
        params={
            "lat_min": -10.0,
            "lat_max": 10.0,
            "lon_min": 50.0,
            "lon_max": 80.0,
            "variable": "temperature",
            "depth": 0,
        },
    )
    assert stats.status_code == 200
    s_data = stats.json()
    assert "mean" in s_data
    assert "min" in s_data
    assert "max" in s_data
    assert s_data["wet_cells"] > 0


def analytic_dataset():
    t, z, y, x = np.meshgrid(
        [0, 1],
        [0.0, 100.0, 500.0],
        [5.0, 10.0, 15.0],
        [60.0, 65.0, 70.0],
        indexing="ij",
    )
    ds = xr.Dataset(
        {
            "thetao": (
                ("time", "lev", "lat", "lon"),
                273.15 + 20 + t - 0.02 * z + 0.1 * y + 0.01 * x,
                {"units": "K"},
            )
        },
        coords={
            "time": np.array(["2026-09-02", "2026-09-03"], dtype="datetime64[ns]"),
            "lev": [0.0, 100.0, 500.0],
            "lat": [5.0, 10.0, 15.0],
            "lon": [60.0, 65.0, 70.0],
        },
    )
    ds.lev.attrs = {"units": "m", "positive": "down"}
    return ds


def test_alias_units_sorting_and_true_linear_collocation(tmp_path):
    ds = analytic_dataset().isel(lat=slice(None, None, -1), lev=slice(None, None, -1))
    path = tmp_path / "aliases.nc"
    ds.to_netcdf(path)
    a = NetCDFDatasetAdapter(path)
    assert a.variables == ["temperature"]
    assert a.ds.latitude.values.tolist() == [5, 10, 15]
    obs_path = tmp_path / "obs.json"
    obs_path.write_text(
        json.dumps(
            [
                {
                    "id": "TEST",
                    "instrument_type": "CTD",
                    "latitude": 7.5,
                    "longitude": 62.5,
                    "timestamp": "2026-09-02T00:00:00Z",
                    "profiles": [
                        {"depth": 50, "temperature": 20.0},
                        {"depth": 250, "temperature": 15.0},
                        {"depth": 900, "temperature": 3.0},
                    ],
                }
            ]
        )
    )
    result = OceanService(path, obs_path).compare("TEST")
    assert result["profiles"][0]["model"] == pytest.approx(
        20 - 0.02 * 50 + 0.1 * 7.5 + 0.01 * 62.5
    )
    assert result["profiles"][1]["model"] == pytest.approx(
        20 - 0.02 * 250 + 0.1 * 7.5 + 0.01 * 62.5
    )
    assert result["profiles"][2]["model"] is None
    assert result["matched_samples"] == 2


@pytest.mark.parametrize(
    "change", ["no_depth", "bad_units", "duplicate", "nan_coordinate", "pressure"]
)
def test_ingestion_rejects_unsupported_files(tmp_path, change):
    ds = analytic_dataset()
    if change == "no_depth":
        ds = ds.isel(lev=0, drop=True)
    if change == "bad_units":
        ds.thetao.attrs["units"] = "furlongs"
    if change == "duplicate":
        ds = ds.assign_coords(lat=[5.0, 5.0, 15.0])
    if change == "nan_coordinate":
        ds = ds.assign_coords(lat=[5.0, np.nan, 15.0])
    if change == "pressure":
        ds.lev.attrs["units"] = "dbar"
    path = tmp_path / f"{change}.nc"
    ds.to_netcdf(path)
    with pytest.raises(ValueError):
        NetCDFDatasetAdapter(path)


def test_upload_is_atomic_and_real_dataset_has_no_demo_sensors(client, tmp_path):
    try:
        response = client.post(
            "/api/datasets/upload",
            files={"file": ("bad.nc", b"not netcdf", "application/octet-stream")},
        )
        assert response.status_code == 422
        assert client.get("/api/datasets").json()[0]["synthetic"] is True
        path = tmp_path / "actual.nc"
        analytic_dataset().to_netcdf(path)
        response = client.post(
            "/api/datasets/upload",
            files={
                "file": ("actual.nc", path.read_bytes(), "application/octet-stream")
            },
        )
        assert response.status_code == 200
        assert response.json()["synthetic"] is False
        assert client.get("/api/observations").json() == []
        assert client.get("/api/currents").status_code == 422
        assert client.get("/api/ocean/slice?depth=50").status_code == 200
    finally:
        assert client.post("/api/datasets/demo").status_code == 200


def test_cors_local_development(client):
    response = client.options(
        "/api/datasets",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
