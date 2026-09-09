from pathlib import Path

import numpy as np
import pytest
import xarray as xr
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.services.ocean import OceanService


@pytest.fixture()
def analytic(tmp_path):
    lon = np.arange(-180, 180, 90)
    lat = [-60, 0, 60]
    values = np.broadcast_to(np.cos(np.radians(lon)), (1, 2, 3, 4)).copy()
    ds = xr.Dataset({'temperature': (('time', 'depth', 'latitude', 'longitude'), values, {'units': 'degC'})}, coords={'time': [np.datetime64('2026-01-01')], 'depth': [0, 100], 'latitude': lat, 'longitude': lon})
    path = tmp_path / 'periodic.nc'
    ds.to_netcdf(path)
    return OceanService(path, None)


def test_periodic_profile_and_great_circle(analytic):
    assert analytic.adapter.is_global
    assert analytic.profile(0, 135, 0)['profiles'][0]['temperature'] == pytest.approx(-0.5)
    assert analytic.profile(0, 185, 0) == analytic.profile(0, -175, 0)
    section = analytic.transect(0, 170, 0, -170, 0, 0, 'temperature', 5)
    assert section['total_distance_km'] == pytest.approx(2223.9, abs=0.02)
    assert abs(section['points'][2]['longitude']) == 180
    assert all(abs(p['longitude']) >= 170 for p in section['points'])
    assert all(p['value'] is not None for p in section['points'])


def test_arc_curves_poleward_and_rejects_invalid_endpoints(analytic):
    section = analytic.transect(30, -30, 30, 30, 0, 0, 'temperature', 3)
    assert section['points'][1]['latitude'] > 33
    for endpoints in [(90, 0, 0, 0), (0, 0, 0, 0), (0, 0, 0, 180), (float('nan'), 0, 0, 0)]:
        with pytest.raises(ValueError):
            analytic.transect(*endpoints, 0, 0, 'temperature')


def test_statistics_match_known_grid_and_validate_bounds(analytic):
    stats = analytic.region_stats(-60, 60, -90, 90, 0, 0, 'temperature')
    assert stats['mean'] == pytest.approx(1 / 3, abs=1e-5)
    assert stats['wet_cells'] == 9
    assert stats['std'] == pytest.approx(np.std([0, 1, 0]), abs=1e-5)
    for bounds in [(10, -10, 0, 90), (-90, 90, -180, 180), (-10, 10, 170, -170), (-10, 10, 0, float('nan'))]:
        with pytest.raises(ValueError):
            analytic.region_stats(*bounds, 0, 0, 'temperature')


def test_spatial_routes_and_seam():
    with TestClient(app) as client:
        assert client.post('/api/datasets/demo').status_code == 200
        for route in ('profile', 'inspect'):
            result = client.get(f'/api/ocean/{route}', params={'latitude': 0, 'longitude': 179})
            assert result.status_code == 200
            assert 'NaN' not in result.text
        result = client.get('/api/ocean/transect', params={'lat1': 0, 'lon1': 170, 'lat2': 0, 'lon2': -170})
        assert result.status_code == 200
        assert result.json()['total_distance_km'] < 2300
        assert client.get('/api/ocean/stats?lat_min=15&lat_max=5&lon_min=65&lon_max=85').status_code == 422
